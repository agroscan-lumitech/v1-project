# AgroScan V1 — SEO, AEO, GEO and LLMO implementation

## Scope and principles

This implementation covers the farmer-facing site at `v1.agroscan.dpdns.org` and the public project site at `media.v1.agroscan.dpdns.org`. The developer dashboard remains noindex. User accounts, personal farm records and private application pages must not be indexed.

SEO, AEO (answer-engine optimization), GEO (generative-engine optimization) and LLMO (large-language-model discoverability) share the same foundations: accessible public HTML, accurate canonical URLs, useful original content, crawlable links, clear authorship, factual sourcing and consistent entity descriptions. No markup, file or crawler rule guarantees rankings, AI citations or inclusion in an index.

## Implemented

- Consistent canonical origins and public XML sitemaps for the two public hosts.
- Sitemap contains only intended public pages; the empty donation page and legacy launch countdown are excluded from indexing.
- Robots policy allows OAI-SearchBot for ChatGPT Search while separately disallowing GPTBot model-training crawling by default.
- `llms.txt` files summarize the public sites, link to key pages and state important accuracy boundaries. This is an optional convention, not a search ranking signal or a guaranteed crawler feature.
- Homepage entity graph identifies AgroScan AI as an independent organization and web application, without fabricated addresses, ratings, credentials or government affiliations.
- New About and FAQ pages provide concise, direct answers, explain limitations and link to authoritative Indian agriculture references.
- Main homepage links to About, FAQ, Features, AgroPedia and Contributors.
- Netlify redirects the explicit `/index.html` URL to the canonical site root.
- Static validation checks sitemap/canonical consistency, JSON-LD syntax, crawler policy and the new public resources.

## Content quality requirements (ongoing)

1. Keep one clear H1 per page and use descriptive, unique page titles and meta descriptions.
2. Each agricultural article should identify its real author, describe relevant experience accurately, cite primary sources and display a truthful review/update date when a substantive review occurs.
3. Do not invent agronomist credentials, laboratory certification, research partnerships, customer counts, testimonials, ratings, yields or local offices.
4. Update scheme details from the relevant official government source and show when the information was checked.
5. Add district/state-specific pages only when the team can provide genuinely local information and maintain it. Do not add fake addresses or LocalBusiness schema.
6. Keep private pages out of sitemaps and retain their noindex controls. Do not block those pages in robots.txt if crawlers need to read a noindex directive.
7. Add Article structured data only when it accurately matches visible article content and visible authorship. FAQ structured data must match questions and answers shown on the page. Google does not guarantee rich results for valid structured data.

## Owner actions after deployment

1. Confirm Netlify custom domains and HTTPS for both public sites.
2. In Google Search Console, verify the domain/property for `agroscan.dpdns.org` and the URL-prefix property for `https://media.v1.agroscan.dpdns.org/`; submit each host's sitemap.
3. In Bing Webmaster Tools, verify both hosts and submit the sitemaps. Consider IndexNow after generating and hosting a separate public key for each host.
4. Use URL Inspection / live tests on the homepage, About, FAQ and representative AgroPedia articles. Confirm the selected canonical matches the sitemap.
5. Validate JSON-LD with Schema.org Validator and Google's Rich Results Test where the type is supported. Structured data does not guarantee a rich result.
6. Review Search Console indexing, crawl stats, Core Web Vitals and query performance after the new pages are deployed.
7. Confirm that contributor contact details shown publicly are intentionally approved for publication before the contributor pages are promoted further.

## Primary references

- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google people-first content and E-E-A-T guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google canonicalization: https://developers.google.com/search/docs/crawling-indexing/canonicalization
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- Google structured-data policies: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Bing Webmaster Guidelines: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
- Bing IndexNow setup: https://www.bing.com/indexnow/getstarted
- OpenAI crawler documentation: https://developers.openai.com/api/docs/bots
- ICAR: https://icar.gov.in/en/about-us
- Soil Health Card portal: https://soilhealth.dac.gov.in/
- IMD agricultural services: https://mausam.imd.gov.in/responsive/servicesMetAgriculture.php
