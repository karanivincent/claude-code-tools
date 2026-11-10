# Thumbnails, titles and first frames: what exists and what to change (November 2026)

Research for the `story-thumbnails` skill (general-tools 1.70.0), 10 November 2026. It builds on Bible in Clay's
`docs/thumbnails/RESEARCH.md` (27 October 2026), which covered click principles. This pass covers what that one did
not: existing skills, click-testing tools, what Shorts allow now, and ways to make better cards.

## Verdict

- Yes, we researched the principles in October, and nothing found since contradicts them. The evidence behind most
  public "CTR lift" numbers is weak (vendor blogs, no method).
- No existing skill does our job: cards rendered from the film's own code, a critic panel, an honesty veto and a
  per-channel learning loop. The public skills are mostly text briefs or image-prompt wrappers. Three are worth
  borrowing from, all MIT: Higgsfield's `higgsfield-youtube-thumbnail`, `ravsau/youtuber-skills` and
  `gladosAagman/youtube-agent-skill`.
- The biggest gap is Shorts. YouTube's own help page says Shorts cannot be A/B tested. The Shorts feed shows the
  video, not a thumbnail. So for Epiclings the first frame and first line are the package, and "viewed vs swiped
  away" is the number to learn from. The skill's step 8 should stop saying "where offered" for Shorts.
- No tool predicts clicks reliably. Saliency models can check where the eye lands, nothing more. YouTube's test
  picks by watch time, not clicks.
- Generation: Higgsfield (already connected) can upscale, cut out and make small edits on our own frames. That is
  the safe use. Fully generated cards would break the look and the honesty rule.

## 1. Existing agent skills

| Skill | What it does | Method | Licence, size | What to take |
|---|---|---|---|---|
| [higgsfield-ai/skills: higgsfield-youtube-thumbnail](https://github.com/higgsfield-ai/skills/tree/main/higgsfield-youtube-thumbnail) (v0.14.0, pushed 5 Nov 2026; [listing](https://skills.sh/higgsfield-ai/skills/higgsfield-youtube-thumbnail): about 120K installs, first seen 3 Aug 2026) | 16:9, 9:16 and 4:5 covers through the Higgsfield CLI | Five or more truthful concepts across 16 named "frameworks" (posed portrait, action shot, size difference, repetition, map, before/after and more). Pick one information gap. Must read "in under one second at roughly 120px wide". Main render on Nano Banana Pro at 4K, small edits on Seedream, 3D logo on gpt-image-2. Text is a separate overlay by default, not baked in. An emotion ladder (shock, hype, rage, awe, laugh, fear, smug...). For 9:16, "faces in the upper two-thirds". Never invent claims. | MIT, about 1,900 stars | The frameworks list as a menu for the idea agents. The 120 px glance test. The text overlay recipe in `references/text-overlay-bake.md`: Anton or Bebas Neue, caps, a thick stroke drawn under the fill (`paint-order: stroke fill`), cap height 12 to 18% of the frame, 2 to 4 words, never on the face |
| [ravsau/youtuber-skills: youtube-packaging](https://github.com/ravsau/youtuber-skills) (pushed 1 Oct 2026) | Five title and thumbnail pairs from a topic, with image prompts | Scores each pair twice: "Click" and "Deliver". Draws on MrBeast's handbook, Paddy Galloway, George Blackman and others | MIT, 6 stars | The two scores side by side: Deliver is our Honest, made a number instead of only a veto |
| [gladosAagman/youtube-agent-skill](https://github.com/gladosAagman/youtube-agent-skill) (date not shown) | `/yt-package` checks title and thumbnail together for truncation, repeated words and vagueness. `/yt-test` checks whether an A/B result is significant | Two-proportion z-test. Refuses to call a winner under 1,000 impressions per arm | MIT, 0 stars | The impressions floor before anything goes in the Results table |
| [AgriciDaniel/claude-youtube](https://github.com/AgriciDaniel/claude-youtube) (pushed 10 Apr 2026) | Broad YouTube skill set. `/youtube thumbnail` writes a brief with three variants and a title-fit check. It can generate images through a Nano Banana MCP | Text brief plus optional Gemini image | MIT, 731 stars | Little beyond what we have |
| [Samin12/claude-thumbnails](https://github.com/Samin12/claude-thumbnails) | Four Gemini-made cards with your headshot pasted in, shown as a 2x2 grid | Python with Pillow | Licence not stated, 9 stars | Nothing: built for talking-head channels |

Also seen: many "nano banana" image skills with a thumbnail preset ([glebis](https://www.skills.sh/glebis/claude-skills/nano-banana), [kkoppenhaver](https://claudeskills.info/skills/kkoppenhaver/cc-nano-banana/nano-banana/)). Nothing in Anthropic's official skills repo. I did not find Cursor rules or GPTs worth taking (not searched in depth, so unverified).

## 2. Tools that predict or test clicks

- **YouTube Test & Compare** ([help page](https://support.google.com/youtube/answer/13861714)): up to three thumbnails, three titles, or both together. The winner is the option with the highest watch-time share, not click-through. A test can take up to two weeks. Not eligible: Shorts, made-for-kids, private, 18+ videos. "A video that becomes a Short" loses its tests. Title testing reached creators in late 2025 ([Search Engine Journal, Sep 2025](https://www.searchenginejournal.com/youtube-adds-title-a-b-testing-and-ask-studio-analytics/556232/); [Tubefilter, Jul 2025](https://www.tubefilter.com/2025/07/16/youtube-feature-test-and-compare-titles-thumbnails/)).
- **Announced at Made on YouTube, 23 Sep 2026** ([TechCrunch](https://techcrunch.com/2026/09/23/youtube-adds-new-creator-tools-like-video-a-b-testing-dynamic-thumbnails-and-live-dubbing/)):
  - Testing "three different cuts for Shorts" from 2027. That would test first frames directly.
  - "Dynamic Thumbnails": YouTube picks, per viewer, from several uploaded cards. Whether this covers Shorts is unverified.
  - Ask Studio suggests titles and thumbnails, and can re-test old videos' thumbnails with permission.
- **Third-party scorers** (Thumblytics, Thumio, ThumbMagic and others): their accuracy claims (85 to 96%) give no method. [Mark Studios](https://www.markstudios.com/research/video-thumbnail-and-ctr-statistics) found a much-quoted study page that no longer exists. Not worth paying for. TubeBuddy, vidIQ and Spotter were not checked in depth (unverified).
- **Run locally**:
  - [DeepGaze IIE](https://github.com/matthias-k/DeepGaze) (PyTorch, pushed Aug 2026; licence not shown on GitHub, unverified) predicts where eyes land on natural images.
  - [UMSI / predimportance](http://predimportance.mit.edu/) predicts what matters in graphic designs ([paper](https://arxiv.org/abs/2008.02912); code from 2020, licence unclear).
  - [HotGaze](https://pypi.org/project/hotgaze/) (MIT) is a CLI that compares attention overlays.
  - None predicts clicks. They only check that the eye lands on the face and the words.
- **Research**:
  - [Separating Clicks from Baits](https://arxiv.org/abs/2607.23739) (Jul 2026, ICWSM 2027) found misleading thumbnails with an LLM. It read the thumbnail, the subtitles and a text description of the video. Claude 3.5 Sonnet did best, at 93.8% accuracy. This supports our honesty editor, given the same three inputs.
  - [What Would You Click?](https://arxiv.org/abs/2607.12882) (Jul 2026, [code](https://github.com/hezy18/PVTG)) picks key frames, then turns them into thumbnails with VLM-guided diffusion. Users preferred its cards in a user study. It is close to our frames-first method.
- **Higgsfield's `virality_predictor`** (in Vincent's connected Higgsfield tools) scores a whole video for hook strength and retention risk. It has no published validation (unverified). Worth one trial on a finished Short, set against its real swipe rate.

## 3. Shorts thumbnails in 2026

- **Custom Shorts thumbnails**:
  - YouTube's [blog, 24 Jul 2026](https://blog.youtube/news-and-events/youtube-studio-custom-thumbnail-updates/): Partner Program creators "can start uploading custom thumbnails for Shorts", with more creators to follow.
  - The [thumbnail help page](https://support.google.com/youtube/answer/72431): Studio on a computer only. The account must be verified. Recommended 9:16 at 2160x3840.
- **Picking a frame**: suggested frames on desktop. A custom frame from the video can be picked only in the mobile app ([PPC Land, Jul 2026](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/); second-hand).
- **A/B testing**: not for Shorts (help page above).
- **Where the card shows**:
  - It shows on the homepage, the channel page's Home and Shorts tabs, search and subscriptions. It does not show in the Shorts feed, which plays the video.
  - On those surfaces the card is cropped to about 3:2, so keep content away from the top and bottom (Rene Ritchie via [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/) and [Relevant Audience](https://www.relevantaudience.com/social-media-marketing/youtube-shorts-custom-thumbnails-no-ab-testing/); second-hand, not on a YouTube help page).
- **Where Shorts views come from**: YouTube said in Jan 2025 that 99.9% of Shorts views come from the feed (reported by PPC Land; second-hand, unverified at source). So the card matters for a small slice of views. The first frame decides the rest.
- **The feed's equivalent of click-through** is "viewed vs swiped away" ([YouTube help](https://support.google.com/youtube/answer/12220281)). YouTube publishes no benchmark for it. Compare each Short with the channel's own median. The 75 to 80% targets online are creators' figures.

## 4. Making better cards than a raw frame

- **Models** (rankings from guides, unverified):
  - Higgsfield's [thumbnail page](https://higgsfield.ai/ai-thumbnail-generator) and skill use Nano Banana Pro for the main image and faces, gpt-image-2 for clean text, and Seedream v5 for small edits.
  - Guides disagree on which renders text best ([one](https://aireiter.com/pt/blog/best-ai-model-youtube-thumbnails-tested)). Our cards set words in code, so it does not matter.
- **Safe uses for a toon card**. All of these keep the frame from the film as the base:
  - Upscale to 4K (Higgsfield `upscale_image`).
  - Cut out the hero (`remove_background`) and recompose: bigger, centred in the 3:2 band, with a simpler background.
  - One small edit: push a bean-head expression, or make a fire hotter.
  - The Higgsfield skill bans copying a style reference's identity. We go further: nothing the video does not show.
  - A fully generated card would not match the toon look, and could show things the film lacks.
- **Text styling**: the Higgsfield overlay recipe above. It renders the words in code at no credit cost, the same approach as our `ThumbCard`.
- **How top teams work**:
  - The title and thumbnail are planned before filming. If an idea cannot be packaged, drop it (Paddy Galloway, [Creator Science](https://podcast.creatorscience.com/paddy-galloway/); [X](https://x.com/PaddyG96/status/1788967959882346991)).
  - The glance test, with title and card read as one ([X](https://x.com/PaddyG96/status/1811083499044044951)).
  - Under 60 characters for the title, under 5 words on the card.
  - MrBeast's team makes about 50 title and card ideas per video, decided before shooting ([Social Media Today](https://www.socialmediatoday.com/news/youtube-shares-insights-mrbeasts-team-creates-compelling-thumbnail)).
  - Our three idea agents with four ideas each make 12. That is the same idea at a smaller scale.

## 5. Principles: what adds to or challenges our rubric

- **Nothing robust contradicts the rubric.** Faces with one strong feeling beat neutral or no faces in every source, but every number is from vendors ([example](https://www.tubeanalytics.net/resources/research/thumbnail-ctr-patterns-study-2026)). Direction confirmed, size unknown.
- **Words may help in search and hurt in the feed.** One study page says 3 to 5 words of text helped in search (+11 to 22%) and hurt slightly in browse (-4%) (same page, unverified). For a Short's card, which mostly shows in search and on the channel page, a word or two is fine. On the first frame, words should name the stakes.
- **The test rewards watch time, not clicks.** A card that over-promises loses. Honest and First frame matter more than Stop. The critics should predict "click and stay", not raw click-through.
- **The 3:2 crop** on Shorts surfaces is missing from the rubric.
- **The first frame is most of the package for a Short**, so it should carry more weight for Shorts than the card does.

## What to change in story-thumbnails

| # | What | Why | Source | Effort |
|---|---|---|---|---|
| 1 | Shorts: drop "A/B test where offered". The first frame and first line become the scored package, and the card is secondary. Record each Short's "viewed vs swiped away" against the channel median after 7 days in the Results table. | Shorts cannot be tested. The feed shows the video, not the card. | [Test & Compare help](https://support.google.com/youtube/answer/13861714); [Shorts analytics help](https://support.google.com/youtube/answer/12220281) | Small |
| 2 | Shorts card: keep the face and the words in the centre 3:2 band. Export at 2160x3840. Add the crop to the phone-feed mock. | The card is cropped to about 3:2 on home, channel and search. | [Thumbnail help](https://support.google.com/youtube/answer/72431); Ritchie via PPC Land (second-hand) | Small |
| 3 | Protect the learning loop. Never unlist or turn a video into a Short while its test runs. Record no winner under about 1,000 impressions per card. | Every Bible in Clay test so far ended early: Unlisted, stopped at 23 to 26 impressions. No result has been learned. | bible-shorts `docs/thumbnails/README.md`; help page; gladosAagman `/yt-test` | Small |
| 4 | Critics score "click and stay", in two numbers (Click, Deliver), not just click-through. | YouTube picks the winner by watch-time share. | Help page; ravsau youtube-packaging (MIT) | Small |
| 5 | Give the idea agents Higgsfield's 16 frameworks and emotion ladder as a menu, beside the three angles. | More different ideas for the same agent cost. | higgsfield-youtube-thumbnail (MIT) | Small |
| 6 | The honesty editor reads the card, the transcript and the shot list together. | That three-input setup found misleading cards at 93.8%. | [arXiv 2607.23739](https://arxiv.org/abs/2607.23739) | Small |
| 7 | Text: stroke under the fill, cap height 12 to 18%, 2 to 4 words. Check at 120 px as well as 160 px. | A proven recipe for type that reads small. | Higgsfield `text-overlay-bake.md` | Small to medium |
| 8 | Optional polish pass on Higgsfield (connected): upscale, cut out and recompose, one expression push. Always on the film's own frame. Trial it on one story against the plain card. | A sharper, bigger subject without leaving the look or the truth. | Higgsfield skill and MCP tools | Medium, credits |
| 9 | Optional saliency check: DeepGaze IIE heatmap on the shortlist, to confirm the eye lands on the face and the words. | Cheap and local. A sanity check only: no link to clicks is shown. | [DeepGaze](https://github.com/matthias-k/DeepGaze) (licence unverified) | Medium |
| 10 | Get ready for 2027: make 2 or 3 opening variants of each Short cheap to render. | YouTube will test Shorts cuts from 2027. Dynamic Thumbnails may pick per viewer. | [TechCrunch, 23 Sep 2026](https://techcrunch.com/2026/09/23/youtube-adds-new-creator-tools-like-video-a-b-testing-dynamic-thumbnails-and-live-dubbing/) | Later |

### Not verified

- Whether Epiclings has the Partner Program, so whether it can upload custom Shorts thumbnails yet. Check in Studio.
- Whether Dynamic Thumbnails covers Shorts, and its rollout date.
- The 99.9% feed share, and Ritchie's exact words (both second-hand).
- Every CTR lift percentage quoted by vendors and blogs.
- The DeepGaze and UMSI licences.
- The accuracy of Higgsfield's virality predictor.
