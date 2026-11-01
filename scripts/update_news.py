#!/usr/bin/env python3
"""Build a GitHub Pages news snapshot from public publisher RSS feeds (no keys)."""
import concurrent.futures
import html
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

FEEDS = [
    ('iROZHLAS', 'Czechia', 'https://www.irozhlas.cz/rss/irozhlas'),
    ('ČT24', 'Czechia', 'https://ct24.ceskatelevize.cz/rss'),
    ('Seznam Zprávy', 'Czechia', 'https://www.seznamzpravy.cz/rss'),
    ('BBC News', 'World', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
    ('The Guardian', 'World', 'https://www.theguardian.com/world/rss'),
    ('BBC News', 'Business', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
    ('The Guardian', 'Business', 'https://www.theguardian.com/business/rss'),
    ('CNBC', 'Business', 'https://www.cnbc.com/id/10001147/device/rss/rss.html'),
    ('The Guardian', 'Economics', 'https://www.theguardian.com/business/economics/rss'),
    ('CNBC', 'Economics', 'https://www.cnbc.com/id/20910258/device/rss/rss.html'),
    ('BBC News', 'Politics', 'https://feeds.bbci.co.uk/news/politics/rss.xml'),
    ('The Guardian', 'Politics', 'https://www.theguardian.com/politics/rss'),
    ('BBC News', 'Science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'),
    ('The Guardian', 'Science', 'https://www.theguardian.com/science/rss'),
    ('NASA', 'Science', 'https://www.nasa.gov/news-release/feed/'),
    ('The Guardian', 'Climate', 'https://www.theguardian.com/environment/climate-crisis/rss'),
    ('BBC Sport', 'Sports', 'https://feeds.bbci.co.uk/sport/rss.xml'),
    ('The Guardian', 'Sports', 'https://www.theguardian.com/sport/rss'),
]

TOPICS = ['Czechia', 'World', 'Politics', 'Business', 'Economics', 'Science', 'Climate', 'Sports']


def brief_summary(article):
    """Use complete opening sentences when the feed supplies them; never invent context."""
    text = re.sub(r'\s+', ' ', article['detail']).strip()
    # Guardian descriptions can start with a standalone deck followed by a paragraph.
    paragraph = article['detail'].split('\n\n')[0].strip()
    if len(paragraph) >= 70:
        text = re.sub(r'\s+', ' ', paragraph)
    if len(text) <= 300:
        return text or article['title']
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ“"\d])', text)
    result = sentences[0]
    if len(result) < 90 and len(sentences) > 1:
        result += ' ' + sentences[1]
    return result if len(result) <= 360 else text[:300].rsplit(' ', 1)[0] + '…'


def make_briefing(stories, now):
    """One recent report per topic, favoring source variety and straight reporting."""
    items, source_counts = [], {}
    for topic in TOPICS:
        candidates = [a for a in stories if a['category'] == topic]
        if not candidates:
            continue
        def rank(article):
            try:
                age = max(0, (now - datetime.fromisoformat(article['published'])).total_seconds() / 3600)
            except (ValueError, TypeError):
                age = 168
            editorial = bool(re.search(r'\blive\b|\bopinion\b|\bcomment\b|\bquiz\b|\bpodcast\b|\|', article['title'], re.I))
            return age + source_counts.get(article['source'], 0) * 4 + editorial * 48
        selected = min(candidates, key=rank)
        source_counts[selected['source']] = source_counts.get(selected['source'], 0) + 1
        items.append({**selected, 'summary': brief_summary(selected)})
    words = sum(len(item['summary'].split()) + len(item['title'].split()) for item in items)
    return {'items': items, 'minutes': max(1, (words + 199) // 200)}

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.image = ''
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p', 'br', 'li'):
            self.parts.append('\n\n')
        if tag == 'img' and not self.image:
            self.image = dict(attrs).get('src', '')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1
        if tag in ('p', 'li'):
            self.parts.append('\n\n')

    def handle_data(self, text):
        if not self.skip:
            self.parts.append(text)

    @property
    def text(self):
        text = re.sub(r'[^\S\n]+', ' ', ''.join(self.parts))
        return re.sub(r'\n\s*\n(?:\s*\n)*', '\n\n', text).strip()


def safe_url(value):
    value = html.unescape(value.strip())
    parsed = urllib.parse.urlsplit(value)
    return value if parsed.scheme == 'https' and parsed.netloc else ''


def parse_feed(xml, source, category):
    root = ET.fromstring(xml)
    stories = []
    for item in root.findall('.//item')[:10]:
        title = html.unescape(item.findtext('title', '')).strip()
        url = safe_url(item.findtext('link', ''))
        if not title or not url:
            continue
        raw = item.findtext('{http://purl.org/rss/1.0/modules/content/}encoded') or item.findtext('description', '')
        parser = TextExtractor()
        parser.feed(raw)
        detail = re.sub(r'\s*Continue reading(?:\.{3}|…)?\s*$', '', parser.text)
        summary = re.sub(r'\s+', ' ', detail)
        if len(summary) > 230:
            summary = summary[:230].rsplit(' ', 1)[0] + '…'
        image = ''
        for element in item.iter():
            local = element.tag.rsplit('}', 1)[-1]
            if local in ('thumbnail', 'content', 'enclosure'):
                candidate = safe_url(element.get('url', ''))
                if candidate and (local == 'thumbnail' or element.get('medium') == 'image' or element.get('type', '').startswith('image') or re.search(r'\.(jpe?g|png|webp)(?:\?|$)', candidate, re.I)):
                    image = candidate
        image = image or safe_url(parser.image)
        try:
            published = parsedate_to_datetime(item.findtext('pubDate', '')).astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError, OverflowError):
            published = None
        stories.append(dict(id=url, title=title, url=url, source=source, category=category,
                            detail=detail, summary=summary, image=image, published=published,
                            language='cs' if category == 'Czechia' else 'en'))
    return stories


def fetch_feed(feed):
    source, category, url = feed
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'MorningBrief/1.0 (personal RSS reader)', 'Accept': 'application/rss+xml, application/xml, text/xml'})
        with urllib.request.urlopen(request, timeout=25) as response:
            stories = parse_feed(response.read(), source, category)
        if not stories:
            raise ValueError('Feed contained no articles')
        return dict(source=source, category=category, ok=True), stories
    except Exception as error:
        print(f'{source} / {category}: unavailable ({type(error).__name__})')
        return dict(source=source, category=category, ok=False), []


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=9) as executor:
        results = list(executor.map(fetch_feed, FEEDS))
    # Prefer dedicated topic feeds when the same article appears in several feeds.
    articles = {}
    priority = {'Czechia': 2, 'World': 0, 'Business': 0, 'Politics': 1, 'Sports': 1, 'Science': 1, 'Economics': 2, 'Climate': 2}
    for status, stories in results:
        for article in stories:
            previous = articles.get(article['id'])
            if previous is None or priority[article['category']] > priority[previous['category']]:
                articles[article['id']] = article
    if not articles:
        raise SystemExit('No live feeds available; refusing to replace the existing briefing.')
    stories = sorted(articles.values(), key=lambda a: a['published'] or '', reverse=True)
    now = datetime.now(timezone.utc)
    payload = dict(stories=stories, briefing=make_briefing(stories, now),
                   feeds=[status for status, _ in results], updated=now.isoformat())
    output = Path(__file__).resolve().parent.parent / 'public' / 'news.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(output)
    print(f'Wrote {len(stories)} articles from {sum(s["ok"] for s, _ in results)}/{len(FEEDS)} feeds to {output}')

if __name__ == '__main__':
    main()
