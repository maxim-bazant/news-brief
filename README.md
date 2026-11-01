# The Morning Brief

A mobile-first, personal news reader with Czech and international news and article excerpts covering of world news, politics, business, economics, science, climate and sports. Built with plain HTML, CSS and JavaScript for GitHub Pages. No npm dependencies, API keys, OpenAI services or paid news API required.

## Publish on GitHub Pages

1. Push this project to a GitHub repository with a `main` branch.
2. In the repository, open **Settings → Pages → Build and deployment → Source**, and choose **GitHub Actions**.
3. Open **Actions → Refresh news and deploy Pages → Run workflow** if the first push happened before Pages was enabled.
4. Open the URL shown by the deployment (also available in Settings → Pages).

See [GitHub's official Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for hosting configuration.

The workflow fetches current feeds and deploys `public/` on every push to `main`, on demand, and roughly every two hours. GitHub schedules can be delayed; scheduled workflows run on the default branch. In public repositories GitHub can disable scheduled workflows after 60 days without repository activity; re-enable them in Actions if necessary. Adjust the branch in `.github/workflows/deploy.yml` if needed.

**Privacy:** GitHub Pages is generally publicly accessible, including when its source repository is private. Use GitHub's supported private Pages access controls if your plan supports them, or choose an authenticated host if private viewing is required. Saved stories live only in the current browser's local storage.

## Run locally

```sh
python3 scripts/update_news.py
python3 -m http.server 8000 --directory public
```

Open http://localhost:8000. Run the update script again whenever you want fresh data locally. The browser checks for an updated snapshot every ten minutes while visible, when you return to the tab, and when you press refresh. Refreshing the browser does not trigger a GitHub Action.

Run the briefing checks with `python3 -m unittest discover -s tests -v` and reader interaction checks with `node --test tests/client.test.cjs` (Node 18 or newer). The interaction checks use a simulated DOM; they do not verify visual layout in a real browser. The deployment workflow runs both before updating the news.

## Features

- iROZHLAS, ČT24 and Seznam Zprávy for Czech-language reporting, alongside BBC News, BBC Sport, The Guardian, CNBC and NASA, across eight topics.
- A news feed that alternates topics, so a busy sports or business feed does not dominate the first page. Individual topic views and search show newest reports first.
- Short publisher excerpts for scanning; a reading panel with the longer feed excerpt and original article link.
- Publisher-provided images when available; missing or blocked images are omitted.
- Mobile bottom navigation for News, Czechia and Saved; sticky topic chips and search; large tap targets; compact thumbnails and single-column stories.
- Full-screen mobile reader with sticky Back, Save and original-article controls. The device/browser Back button closes the reader.
- Category filters, search with or without Czech diacritics, local saved stories, collapsible source availability and publication times.
- Graceful partial-feed failures and a dated cached briefing if loading fails.
- Mobile layout, keyboard-accessible controls and article dialogs.

## Content and customization

Edit `FEEDS` and `TOPICS` in `scripts/update_news.py` to change sources or regional coverage; keep the topic list in `public/assets/app.js` and navigation in `public/index.html` in sync. Styling lives in `public/assets/style.css`. Czechia comes first in the mixed news feed. It collects Czech outlets' general reporting, including domestic and international stories, in the original Czech language. The World section includes international reporting, Politics focuses on UK politics, and Science includes BBC, Guardian and NASA coverage. The reader uses the viewer's local date and time.


Content comes from publisher RSS feeds. Excerpts vary in length; this does not scrape paywalled articles or generate AI-written summaries. Full stories remain on the original outlet and may require a subscription. Images are loaded directly from publisher URLs and may be unavailable. Feed and image availability and publisher reuse terms can change. No sample headlines are presented as live news.

If every feed fails, the workflow stops before deployment and the last published site stays available. Partial failures are shown on the page. The initial checked-in news snapshot is dated; the workflow replaces it on deployment.
