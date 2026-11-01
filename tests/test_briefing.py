import unittest
from datetime import datetime, timedelta, timezone

from scripts.update_news import TOPICS, brief_summary, make_briefing, parse_feed


NOW = datetime(2026, 11, 1, 7, tzinfo=timezone.utc)


def article(topic='World', source='BBC', hours=1, title='An international development', detail='A short factual publisher excerpt.'):
    return dict(id=title, title=title, category=topic, source=source, detail=detail,
                published=(NOW - timedelta(hours=hours)).isoformat())


class BriefingTests(unittest.TestCase):
    def test_overview_spans_available_topics_once_in_reading_order(self):
        stories = [article(topic=topic, title=topic) for topic in reversed(TOPICS)]
        result = make_briefing(stories * 2, NOW)
        self.assertEqual([a['category'] for a in result['items']], TOPICS)
        self.assertGreaterEqual(result['minutes'], 1)

    def test_recent_straight_report_beats_live_blog_and_old_report(self):
        live = article(title='World news live', hours=0)
        old = article(title='Old report', hours=80)
        news = article(title='New report', hours=2)
        self.assertEqual(make_briefing([live, old, news], NOW)['items'][0]['id'], news['id'])

    def test_source_variety_among_reports_of_similar_age(self):
        world = article(source='BBC')
        bbc = article(topic='Politics', source='BBC', title='BBC politics', hours=1)
        guardian = article(topic='Politics', source='Guardian', title='Guardian politics', hours=2)
        result = make_briefing([world, bbc, guardian], NOW)
        self.assertEqual(result['items'][1]['source'], 'Guardian')

    def test_short_summary_keeps_publisher_text(self):
        detail = 'Scientists report a new result. The team plans more research.'
        self.assertEqual(brief_summary(article(detail=detail)), detail)

    def test_long_excerpt_uses_complete_opening_sentence(self):
        first = 'Researchers have published findings that give a more detailed account of how the system changes over time.'
        detail = first + ' ' + 'Further detail from the publisher follows. ' * 20
        self.assertEqual(brief_summary(article(detail=detail)), first)

    def test_missing_excerpt_falls_back_to_headline(self):
        self.assertEqual(brief_summary(article(title='Only a headline', detail='')), 'Only a headline')

    def test_missing_topics_do_not_invent_reports(self):
        self.assertEqual(make_briefing([], NOW), {'items': [], 'minutes': 1})
        result = make_briefing([article(topic='Science', title='Undated science', hours=2) | {'published': None}], NOW)
        self.assertEqual([a['category'] for a in result['items']], ['Science'])

    def test_czech_feed_preserves_accents_language_and_image(self):
        xml = '''<rss><channel><item><title>Česká věda a výzkum</title>
        <link>https://example.cz/clanek</link>
        <description><![CDATA[<p>Čeští vědci zveřejnili výsledky.</p><img src="https://example.cz/foto.jpg">]]></description>
        <pubDate>Sun, 01 Nov 2026 08:00:00 +0100</pubDate></item></channel></rss>'''
        report = parse_feed(xml.encode('utf-8'), 'iROZHLAS', 'Czechia')[0]
        self.assertEqual(report['language'], 'cs')
        self.assertEqual(report['title'], 'Česká věda a výzkum')
        self.assertEqual(report['image'], 'https://example.cz/foto.jpg')
        self.assertEqual(report['published'], '2026-11-01T07:00:00+00:00')

    def test_czech_topic_leads_overview(self):
        stories = [article(topic='World'), article(topic='Czechia', title='České zprávy')]
        self.assertEqual(make_briefing(stories, NOW)['items'][0]['category'], 'Czechia')


if __name__ == '__main__':
    unittest.main()
