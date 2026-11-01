# Food & agriculture for worldbuilders: research notes for the Food tab redesign

Compiled 2026-10-31 for World Orogen's Evolution **Food** tab (Farmland, Staple food, Lifestyle, People, Soil, Growing season).

How sure each note is:
- **[read]**: I read the page and the notes come from it.
- **[snippet]**: the page was blocked (403/429/402), so the notes come from search-result text.
- **[knowledge]**: from what I already knew; I did not re-check it on the page. Treat these as likely, not checked.

Blocked sites: Mythcreants, the RimWorld wiki, the Dwarf Fortress wiki (rate-limited), the Civ fandom wiki (402), the Old World wiki (403), Atlas Obscura, Big Think. Reddit search was also blocked: its JSON endpoint returned a bot-check page, and I did not try to get around it. My Reddit coverage therefore comes from the owner's own feedback review (`reports/User feedback review 2026-09.md`) and memory files.

---

## 1. Worldbuilding guidance on food and agriculture

### 1.1 Madeline James: Cultural Worldbuilding guide (the source of the current Food tab)
- Guide index **[read]**: https://madelinejameswrites.com/worldbuilding-guide. It has two parts, Global (Steps 1–12: tectonics → climate → biomes/soil → rocks → deposits) and Cultural (1 Cultural Divides, 2 Human Migration, 3 Animal Domestication, 4 Antiquity and State Building, 5 Empires and Democracy, 6 Middle Ages, 7 Age of Discovery). Cultural playlist: https://www.youtube.com/watch?v=f-MRoDN4IfA&list=PLn7WXgrNpwt8oacNNCASGpaQ0CMamePla. Global playlist: https://www.youtube.com/playlist?list=PLn7WXgrNpwt9ttq_fcjTBK8PEJHdasrV5
- **Part 4, Antiquity** **[read]**: https://madelinejameswrites.com/blog/antiquity
  - Grains decide whether a state can form. Rice is best, then wheat, barley and maize. She judges a crop on four things: is it productive; is its ripeness visible above ground; is the harvest predictable; does it store, transport and ration well? **Underground tubers are a poor fit for states** (this follows James C. Scott, *Against the Grain*). Farming came about 4,000 years before the first states. She also notes the "agricultural trap": the more people farm, the more they depend on farming.
  - Farmers had worse diets than subsistence groups: mortality was 40–50 % higher, and anemia was common. Their edge was demographic, from earlier weaning and children as labour. Dense settlement also brought crowding diseases.
  - Soils: **loess** (wind-laid, downwind of old ice sheets) and **alluvium** (river floodplains). Soils are best in temperate grassland and deciduous forest. Without floodplains, people farm with terraces and chinampas.
  - **Surplus needs coercion**: taxable crops, corvée labour, debt slavery, walls. "Most of the map was non-state territory."
  - **Traders are the "state twins"**: nomadic herders with pack animals in arid, steppe and tundra lands, and seafarers on enclosed seas, rocky coasts and fishing grounds. Their relations with states ran from raiding to tribute, mercenary work and trade.
  - Her mapping steps:
    1. Mark loess and alluvium, and mark rice climates (Am, Cfa, Cwa, Dwa, Dwb) and other grain climates (Cs, Cw, Dfa, Dfb). Give each grain a hearth and let it spread. If there are fewer crops than continents, give each remaining region a crop.
    2. Mark navigable rivers and calm seas.
    3. Find geographic isolation (deserts, mountains, ocean) and overlap it with steps 1–2.
    4. Place the trader twins.
    5. Place non-state settled groups: "almost-states", aquaculture zones (wetlands, rainforests, deltas, coasts, islands) and biome-border zones.
    6. Place non-state migratory groups.
  - Her maps include grain origins and spread (5c, 5d), waterways, a state-placement sequence, trader biomes and pack mounts, aquaculture zones and partly migratory groups.
- **Part 3, Animal Husbandry** **[read]**: https://madelinejameswrites.com/blog/animal-husbandry
  - Animals get domesticated where people need a surplus for hard times; where food is plentiful, there is little reason to.
  - Criteria: not picky eaters, mature quickly, breed in captivity, don't panic and flee, social.
  - Her habitat clusters: sheep and goats (highland and rocky ground), cattle (grassland), pigs (warm forest and marsh), horses (plains and steppe), camels and donkeys (desert), llamas (dry mountains), alpacas (cold, wet highlands), yaks (cold plateaus), reindeer (tundra and taiga), water buffalo (tropical wetland).
  - Beasts of burden come in three kinds: heavy draft, mounts, and pack or light draft.
  - Her steps: map animals by cluster, cross off those lost in extinction events, map beasts of burden, then spread each animal within its cluster. "Animals are more likely to be adopted where they fill an empty category."
- **Takeaway for Orogen.** Her method is already the backbone of the Food tab. What isn't built yet:
  - which animal (draft, mount, pack) lives where;
  - storable, taxable grain against tubers;
  - the trader twins;
  - aquaculture "almost-states".

### 1.2 Mythcreants (blocked; search text only) and Mythic Scribes
- Mythcreants podcast 385, "Food in Spec Fic" **[snippet]**: https://mythcreants.com/blog/podcasts/385-food-in-spec-fic/. Food preparation is "inextricably linked to culture"; when a character meets a new food, they meet a new culture.
- "Starting a Fictional Culture" **[snippet]**: https://mythcreants.com/blog/starting-a-fictional-culture/. Food taboos, for example "refuse to eat grains sown during the blood moon".
- "Understanding Appropriative Worldbuilding" **[snippet]**: https://mythcreants.com/blog/understanding-appropriative-worldbuilding/. Base what people eat on local plants and animals, not on a real culture's dishes.
- "Five Worldbuilding Mistakes Even Enthusiasts Make" **[snippet]**: https://mythcreants.com/blog/five-worldbuilding-mistakes-even-enthusiasts-make/. Culture, food included, should change with technology.
- Mythic Scribes, "Foodbuilding as Worldbuilding" **[snippet]**: https://mythicscribes.com/world-building/foodbuilding/
  - "Cuisines … always center themselves around a number of staple foods."
  - A **"rule of 3"** keeps the work bounded.
  - Non-humans can rank foods differently: beastfolk might prize raw food, swamp or cave goblins rotten food.
  - A desert people would not grow rice without irrigation.
- Optional Rule, "Crafting Cultural Depth Through Food in TTRPGs" **[read]**: https://www.optionalrule.com/2024/09/08/worldbuilding-through-food/
  - Questions for each culture: what three staples make up most meals? What cooking and storage methods do they use? Who may eat what?
  - Geography decides the diet: coasts eat seafood, arid lands drought-hardy grains and preserved food, forests fruit and game.
  - Climate decides preservation: hot lands use spices and drying; cold lands smoke, salt and ferment; temperate lands make cheese and cure meat.
  - Nomads eat portable food. Rare ingredients mark class.

### 1.3 Worldbuilding Stack Exchange
I pulled the tag lists sorted by votes through the SE API. Recurring themes, with **score | title | question id** (URL is `https://worldbuilding.stackexchange.com/questions/<id>`):
- **How much land feeds how many?**
  - 85 | How many people can you feed per square-kilometer of farmland? | 9582. Top answer: sweet potatoes at 70,000 kcal/ha/day, about 2,350 people/km² of pure crop under intensive farming. The second answer: yields vary hugely with crop, soil, climate and technology, and you must choose whether the grain feeds people, livestock or bourbon.
  - 37 | Smallest patch a person could be food-sufficient on, temperate | 118627
  - 31 | Food production methods that would let a metropolis like New York be self-sufficient | 146670
  - 20 | Medieval crop yields | 157161
  - 11 | Size of a family-owned medieval farm? | 125445
  - From related search results **[snippet]**: 3–12 acres a person is the usual rule of thumb, and about 7 million acres of the Paris Basin fed about 200,000 Parisians around 1300 (r/AskHistorians).
- **Why not farm? (herding, gathering, nomads)**
  - 34 | Why would tribes choose herding instead of agriculture in the Great Plains? | 125820. The top answer (69): pre-industrial farming is gruelling and risky, you're tied to the land, and "they starved in the summer because that's the period farthest from the last harvest". Another answer: the thick sod, dry climate, no wood and grasshoppers kept the plains unfarmed until steel ploughs, barbed wire, railways and windmills.
  - 21 | Is it possible to have a habitable planet unsuitable for agriculture? | 58436
  - 21 | Could hunter-gatherers develop complex civilization? | 90469. Göbekli Tepe comes up.
  - 16 | Obligate carnivores: animal husbandry without farming? | 90511
  - 14 | How to make animal husbandry the only agriculture possible | 256320
  - 27 | How does a migratory species farm? | 58800
  - 11 | Food for a nomad in a carriage-like transport | 178954
  - 8 | Sustaining a non-agrarian sedentary population | 270607
- **What grows in this climate?**
  - 6 | Which crops could be grown in a subpolar oceanic (Cfc) climate? | 193213. Answer: "basically anything that grows in Scotland": barley, oats, potatoes.
  - 12 | Earth crops on a 1.5–3 g planet | 245670
  - 15 | At great altitude, what conditions support a human community? | 137897
  - 10 | Is it possible to farm in a swamp? | 150016
  - 10 | Soil types sanity check | 257616
- **Diet and nutrition**
  - 27 | If a civilization could plant only three crops, which would cover all nutritional needs? | 99766. Answer: a **grain + root + legume** triad. A single crop invites famine, as in Ireland. "Dry land is good for millet and wet land for rice."
  - 7 | Labour-intensive staple crop | 256229
- **Famine and climate shocks**
  - 17 | How many "years without a summer" can society survive? | 78047
  - 41 | How would a society isolated by monster attacks get food? | 105272
- **Alien food**
  - 41 | Would humans be able to derive nutrition from foodstuffs found on alien planets? | 47787
  - 26 | How to check what is edible on an alien world? | 151775
  - 88 | Tree shape on a tidally locked world | 164947
  - 32 | Can there be plants on the dark side of a tidally locked world? | 154338
- **Fantasy logistics** (the most popular kind overall)
  - 96 | Lembas bread (2000 kcal per bite)
  - 75 | How to butcher your dragon?
  - 38 | Caloric intake of a dragon
  - 60 | How can dwarves produce honey underground?
  - 39 | Farming the abyssal plain?
  - 13 | How do merfolk develop agriculture?
  - 21 | How can a nocturnal race develop agriculture?
- **Believable cuisine**
  - 26 | How can I make the food of my (fantastical) culture believable? | 185136. Answer: start from **ingredients (climate → plants and animals) → lifestyle (hunters, farmers, fishers? migrate? trade?) → cooking technology**. "Pickling would be widespread in societies that have short growing seasons … and easy access to salt."
  - 43 | What could possibly replace beer? | 124722
- **Takeaway.** The highest-voted, most practical questions are about how many people the land feeds, why people herd or gather instead of farming, and what grows in a given climate. These are exactly what a climate-grounded generator can answer at a glance.

### 1.4 Worldbuilding Pasta (worldbuildingpasta.blogspot.com)
- Site map **[read]**: https://worldbuildingpasta.blogspot.com/p/blog-page.html. No post is about agriculture. The nearest are:
  - "You Can't Feed a Society with Mushrooms" **[read]**: https://worldbuildingpasta.blogspot.com/2024/01/hurried-thoughts-you-cant-feed-society.html. Fungi add no energy; each step of a food chain loses about 90 %; people need about 1 t of dry food a year; vent ecosystems feed a village at most. "Energy is the binding constraint." This is the go-to answer for underground and alien food.
  - The Pasta Bioclimate system **[read]**: https://worldbuildingpasta.blogspot.com/2025/03/beyond-koppen-geiger-climate.html. Classes are built on **growing degree-days (base 5 °C, growth falling above about 30 °C)** and a growing-season aridity index (AET/PET). Neither is designed around crops, but they are the right axes for crop niches.
  - Part VIb, Biomes and Climate Zones: https://worldbuildingpasta.blogspot.com/2020/05/an-apple-pie-from-scratch-part-vib.html
- **Takeaway.** The science-minded part of the community works in GDD × aridity. Orogen's crop model (growth in degree-days, broken by dry or cold gaps) speaks the same language.

### 1.5 Artifexian
- I found no Artifexian video or chapter of his book *Worldsmith* on agriculture **[snippet]**. His channel covers stars, planets and climate; crops aren't a known topic of his.

### 1.6 Diana Wynne Jones, *The Tough Guide to Fantasyland* (the stew trope)
- Katherine Langrish, "Anyone for Stew?" **[read]**: https://www.goodreads.com/author_blog_posts/3383680-anyone-for-stew?tab=book. Jones "warns travellers" that the only food on a Quest, in tavern or camp, is **stew**. Authors fall back on it because cooking on a journey is tedious to write. Potatoes feel wrong in a Middle-earth modelled on early Europe, unless the tone is comic.
- The DWJ Project (Marie Brennan) **[snippet]**: https://www.swantower.com/2011/11/19/the-dwj-project-tough-guide-to-fantasyland/. Brennan answers that curry, chili and gumbo are all stews; the problem is calling everything "stew", which is lazy worldbuilding.
- Fantasy Hive, "Tough Travelling: Food" **[snippet]**: https://fantasy-hive.co.uk/2021/12/tough-travelling-food/. The book's other food entries are STEW, WAYBREAD and SCURVY.

### 1.7 Anachronisms: potatoes and tomatoes in pseudo-medieval worlds
- Encyclopedia of Arda, New World plants FAQ **[snippet]**: https://www.glyphweb.com/arda/faq/newworld.html. Sam's "taters", pipe-weed (explained as a Númenórean import), and first-edition Hobbit tomatoes that Tolkien later changed to pickles. "Corn" in Tolkien means a grass cereal; the films' maize caused the trouble. Tolkien Gateway: https://www.tolkiengateway.net/wiki/Potato
- Khoury et al. 2016, *Proc. R. Soc. B* 283:20160792, "Origins of food crops connect countries worldwide" **[snippet]**: https://cwr.croptrust.org/resources/project-publications/origins-of-food-crops-connect-countries-worldwide/. About **69 % of national food supplies come from crops of foreign origin**. Crops have home "primary regions of diversity", and today's cuisines are mostly borrowed.
- **Takeaway.** Readers notice where a crop came from. A map of **where each staple was first grown and how far it has spread** answers "can my medieval kingdom have potatoes?" in-world: only if the hearth that domesticated them can reach that place. That is the crop-spread work already on branch `farming-spread`.

### 1.8 Other authors and essays
- Joe M. McDermott, "Worldbuilding and the Labor of Food" (Tor/Reactor, 2017/2019) **[read]**: https://reactormag.com/worldbuilding-and-the-labor-of-food/
  - Before modern transport, the central daily worry was whether there would be enough to eat, and that worry is missing from fantasy. "The amount of work that goes into a single grain of wheat, a single loaf of bread, has been lost to us."
  - His questions: What grows in this climate and season? Who farms, mills, preserves and cooks, and how long does it take? What happens to the food supply in war, drought or a harsh winter? Where do non-local foods come from?
- Rachel Neumeier, "Worldbuilding with food" **[snippet]**: https://www.goodreads.com/author_blog_posts/21955743-worldbuilding-with-food
- Juliette Wade's Dive into Worldbuilding, "Food Paths from Source to Mouth" **[read]**: https://dive-into-worldbuilding.blogspot.com/2018/03/food-paths-from-source-to-mouth.html. The search result attributed this to Kate Elliott, but the Kate here is a guest whose surname isn't given. Questions:
  - "How many stops are there on this path?"
  - "Do we consider how the food traveled along the spice road?"
  - "If you put your characters out in the wilderness, how long does the food supply in that area last?"
  - "Why are nomads nomads?"
  - "What are your domestic animals or riding animals eating?"
  - Processing a deer takes 30–40 hours.
- Kate Elliott **[snippet]**: grew up in rural Oregon and pays attention to agriculture and to women's unseen work (Continuum panel notes: https://catherine-bateson.com/2019/06/five-points-from-the-world-building-and-infrastructure-panel-continuum-15-other-worlds/). I found no dedicated food essay by her.
- N. K. Jemisin, *Broken Earth* **[snippet]**: food stored against the "Seasons" (storecaches) is the clearest case of famine planning as worldbuilding. An academic essay: https://equinoxpub.com/projects/food-hub/resource-collection/gardens-flowers-and-fruit/resource/syl-anagist-garden-food-broken-earth
- B. Pine, "Worldbuilding: Food for the People" (Fantasy-Faction, 2014) **[read]**: https://fantasy-faction.com/2014/worldbuilding-food-for-the-people
  - Food comes from farming, hunting and fishing, and foraging. High-yield crops become the staples.
  - Check that the farmland can really feed the population ("agricultural readers will notice").
  - Plan regional surpluses so that trade makes sense.
  - Famines shape religion, harvest gods and taboos. Example: the volcanic Kangi famine in Japan.
  - Class decides diet.
- A.C. Williams, "Worldbuilding 101 for Writers: Agriculture" **[read]**: https://www.goodreads.com/author_blog_posts/23755535-worldbuilding-101-for-writers-agriculture. Mountain peoples have few fresh crops; island peoples live on fish and wild grain; trade fills the gaps.
- Bret Devereaux, ACOUP, "Bread, How Did They Make It? Part I: Farmers!" **[read]**: https://acoup.blog/2020/07/24/collections-bread-how-did-they-make-it-part-i-farmers/
  - Peasants were 80–90 % of people. Households of about 8 people worked about 5 acres.
  - **Grain supplied most calories**; meat and vegetables were mostly flavouring, and rations were counted in grain.
  - **Risk avoidance beat efficiency**: several crops, plots spread across valley, flat and hillside.
  - **Lean season before harvest**: food is cheap after the harvest and dear as stores run down.
  - Stored grain spoils in about a year. Only about 10 % of the surplus reached the cities.
  - This series is the most-cited "how pre-modern food worked" resource among worldbuilders.

### 1.9 Recurring worldbuilder questions (synthesis)
1. **What do people here eat?** Their staple, and what grows in this climate. Every guide asks this first; "three staples" is the common heuristic.
2. **How many people can this land feed?** How big a city can it hold, and how far does the hinterland reach? This is the top practical question on SE.
3. **Why do they farm, herd, gather or fish?** Why are nomads nomads? This is the second big SE theme, and in Madeline James it is the trader twins and the non-state peoples.
4. **What is traded, and what is a luxury?** Spices, sugar, wine, salt, furs. What can't be grown here and must come from where?
5. **When?** Harvest month, the lean or hungry season, festivals, preserving (salting, smoking, pickling), the growing season.
6. **What goes wrong?** Famine, drought, frost, failed monsoons, years without a summer, monoculture risk. And how those shape religion and taboo.
7. **Is this crop plausible here, and has it arrived yet?** Anachronism (potatoes, tomatoes, maize) and crop origins.
8. **Alien and fantasy food.** Edibility, energy budgets, odd habitats (underground, ocean floor, tidally locked worlds).
9. **How does food shape culture?** Cuisine identity, cooking fat, drink, class, taboo, the stew trope.
10. **Where do cities and states rise?** Surplus, rivers, isolation. Users already read Orogen's climate map this way: rumdiary in the feedback review, §5.

---

## 2. Game map modes about food, agriculture and resources

### 2.1 Europa Universalis IV: trade goods
- Trade goods **[read]**: https://eu4.paradoxwikis.com/Trade_goods
  - Each province produces one good, from about 30+ in all. Food and drink goods: grain, fish, wine, livestock, salt, spices, sugar, tea, cocoa, coffee.
  - Base prices (ducats): grain 2.5, fish 2.5, wine 2.5, livestock 2, salt 3, spices 3, sugar 3, tea 2, cocoa 4, coffee 3.
  - Goods give bonuses when a country controls ≥ 20 % of world trade in them:
    - grain: +20 % land force limit;
    - livestock: +50 % supply limit;
    - fish: +25 % sailors;
    - wine: −1 unrest.
  - **Assignment**: the 1444 map is hand-set. **Colonies get "scripted weights" by terrain, climate and region**, plus culture or religion for wine. Examples:
    - sugar: tropical only, never desert, mountain, hills, forest or steppe;
    - livestock: weight 30, ×1.5 on steppe, ×1.25 desert, savannah, highlands or drylands, never glacier, marsh, jungle or forest;
    - coffee: never in any winter;
    - spices: limited to Asian and Central American regions, never mountains.
  - In a **random New World**, coffee and similar crops need a tropical climate. **This is a climate-rule assignment, the closest analogue to what Orogen would do.**
- Map modes **[read]**: https://eu4.paradoxwikis.com/Map_modes
  - The **Trade Goods mode colours each province by its good. Its icon appears only when zoomed in.** Clicking a province **highlights every province with the same good and stripes the provinces that *might* produce it**, the uncolonised "unknown" ones. Hovering shows the production modifiers.
  - Other modes use **four- or five-step legends**, e.g. development high (> 30) / medium / low / very low (< 10), and supply limit. The Climate mode has four classes (temperate, tropical, arid, arctic). The Weather mode shows winter or monsoon (none, mild, normal, severe).
- **Takeaway.** 30 colours can't be read on their own. EU4 makes them work with *select one → highlight all*, *stripes for "could be"*, icons at zoom and hover explanations.

### 2.2 Imperator: Rome
- Trade goods **[read]**: https://imperator.paradoxwikis.com/Trade_goods
  - A **food category**: grain +5 monthly food, fish +3, livestock +3, salt / honey / vegetables +3 % food modifier.
  - Other goods please particular classes of people: wine and dates please freemen, olives slaves, spices citizens.
  - Food feeds pops. A surplus grows population; a shortage shrinks population and happiness. Surplus can be moved along trade routes.
  - Farm goods are produced only in rural settlements. Founding a city swaps the good for a "city" good.
- **Takeaway.** The food-versus-luxury split is the most readable economic idea in grand strategy: staples feed people, luxuries please people.

### 2.3 Victoria 3
- Resources **[read]**: https://vic3.paradoxwikis.com/Resources. Each state has fixed **arable land** and a list of allowed crops (wheat, rice, maize, millet, rye farms, livestock ranches, plantations, fishing wharves). "Livestock ranches can be built nearly anywhere, so that map can also be used as a general map of arable land."
- States **[read]**: https://vic3.paradoxwikis.com/Arable_land (redirects to State). Arable land caps rural buildings.
- Map modes **[read]**: https://vic3.paradoxwikis.com/Map_modes
  - **Construction Interaction**: pick a building (say, a rice farm) and eligible states shade green, darker where more productive. **Pick a crop → see where it can go and how well.**
  - The Production lens hover lists unused arable land. Population and Standard of Living use white→green or red→green ramps.
- Dev Diary #131, "Famines, Starvation, Harvest Conditions" (Oct 2024, patch 1.8) **[read via a Steam-news mirror]**: https://eprison.de/spiele/victoria-3/steam-news/6931694080291569963/7527/78042.html. Original: https://forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-131-famines-starvation-harvest-conditions.1708680/
  - **Harvest conditions** happen at state level, with varying length, reach and intensity.
    - Bad: floods, droughts, wildfires, locust swarms, frosts, heatwaves.
    - Good: pollinator surge, optimal sun.
  - They are **tied to region**: no locusts in northern Europe, no frost in Egypt. They chain: heatwave → drought → wildfire. They exclude each other: no drought with a flood.
  - Food Security runs 0–100 % per pop. Starvation is mild or severe. A famine is a classification with a toll in deaths and unrealised births.
  - The **Starvation map mode** shows starving pops as a share of the state, mild or severe.
- Dev Diary #137 (3D art) **[snippet]**: https://forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-137-the-3d-art-of-pivot-of-empire.1714757/. Drought draws as a drier ground shader, flood as puddles, frost as snow, hail as falling ice.
- **Takeaway.** A shipped game with a hazard map that ties each kind of failure to its climate. Orogen could draw the same thing from its monthly climate.

### 2.4 Civilization VI and VII
- Civ VI resources **[knowledge; the fandom page returned 402]**: https://civilization.fandom.com/wiki/Resources_(Civ6). The category list was confirmed from https://www.civilopedia.net/gathering-storm/resources **[read]**: bonus (bananas, cattle, crabs, deer, fish, maize, rice, sheep, wheat, …), luxury (cinnamon, citrus, cloves, cocoa, coffee, honey, olives, salt, spices, sugar, tea, tobacco, truffles, wine, …) and strategic.
  - Resources are **point icons on tiles**, placed by terrain: wheat on plains and floodplains, rice on grassland and marsh, cattle on grassland, sheep on hills, bananas in rainforest, fish and crabs on coast.
  - **Each distinct luxury counts once** for amenities, so **variety, not quantity, has value**. That is what drives trade.
  - The "resource lens" overlay dims everything else.
- Civ VII **[snippet]**: https://comradekaine.com/civilization7/biomes-the-new-dynamics-of-terrain-and-rivers-in-civilization-vii/. Yields are set by **biome** (tundra, grassland, plains, desert, tropical, marine) instead of tile combinations. Resources are tied to settlements; categories are Bonus, City, Empire, Treasure and Factory.
- **Takeaway.** Icons with tooltips show discrete points of value, an idea every gamer knows. Placement is plausible because it is tied to biome, never to a simulation.

### 2.5 Anno 1800: island fertilities
- DevBlog "Treasures of the soil" **[read]**: https://www.anno-union.com/devblog-schaetze-der-erde/comment-page-1/. "Not every plant will grow on any island". Scarce fertilities are designed to drive **expansion, trade and conflict**, and difficulty settings make them scarcer.
- Each island shows a row of **fertility icons** (grain, potatoes, hops, …) **[snippet]**: https://shacknews.com/article/111234/what-does-missing-fertility-mean-in-anno-1800
- **Takeaway.** "What can grow here" shown as a short row of icons, with scarcity used on purpose to create stories.

### 2.6 RimWorld (wiki blocked)
- **[knowledge + snippet]** https://rimworldwiki.com/wiki/Biomes. The world-tile inspector lists biome, elevation, average, winter and summer temperature, **growing period** (e.g. "Year-round", or a day range), rainfall, **forageability %**, "animals can graze now", disease frequency, stone types. Soil fertility on a colony map is soil, rich soil, gravel or marsh, with a fertility grid overlay.
- **Takeaway.** Players pick a site by *reading a few climate-derived food numbers in the tile inspector*. Orogen's hover readout can play that role.

### 2.7 Dwarf Fortress (wiki rate-limited)
- **[snippet]** https://dwarffortresswiki.org/farming. Above-ground crops grow only in biomes that support them ("not freezing"); a farm plot lists only crops that grow in the local biome and **current season**. Underground crops are the "dwarven" six and need soil or mud. The embark screen shows each biome's details.
- **[knowledge]** Plants carry biome and season tokens. Civilizations have biome preferences that decide where they settle in world generation.
- **Takeaway.** Season-locked crops are a much-loved texture: what you can plant in spring is not what you plant in autumn.

### 2.8 Songs of Syx
- Farming **[read]**: https://songsofsyx.wiki.gg/wiki/Farming
  - Crops: vegetables, fruit, grain, mushrooms, fibre, herbs, opiates. Species prefer different foods.
  - Soil: rich, till, alluvium, infertile, sand.
  - Moisture comes from nearness to fresh water, and farms need **≥ 90 % moisture**.
  - Climate (cold, temperate, hot) helps some crops and hurts others: mushrooms cold, fibre hot, herbs cold, opiates hot.
  - One harvest a year, in a season that depends on the crop.

### 2.9 Old World, CK3, Dominions, Frostpunk (pages blocked or thin; [knowledge])
- **Old World**: food comes from farms (wheat, barley, sorghum), camps (game), groves (citrus), pastures (cattle, sheep, horses), plus fish. Luxuries (wine, incense, silk, …) give family and opinion bonuses. Terrain is shown as hex art with resource icons. Wiki (403): https://wiki.hoodedhorse.com/Old_World/Resources
- **Crusader Kings III**: no food system. Terrain (farmlands, floodplains, drylands, …) sets supply and development; map modes for terrain and development. Wiki: https://ck3.paradoxwikis.com/Terrain
- **Dominions**: province terrain (farm, forest, waste, mountain, swamp, coast) sets population growth, supply and income. The "farmland" province is the breadbasket.
- **Frostpunk**: food is a local stockpile (hunters, hothouses); no map-level agriculture.

### 2.10 Design patterns that work
- **Few classes per view.** 4–5 graded steps for amounts (EU4's legends); about 6–9 hues for categories. Long lists (EU4's 30+ goods, Civ's 40+ resources) need icons, a "select one" highlight, or both.
- **Pick one → see everywhere** (EU4's click-highlight, Vic3's Construction Interaction, Azgaar's Goods Editor "select goods to display"). Orogen's legend chips that show each staple alone already follow this; extend it to every categorical food view.
- **Stripes for "also" or "could be"**: EU4 stripes the provinces that might produce a good. Orogen stripes a close second; keep it.
- **Hue for the kind, lightness for the amount**: Azgaar's Goods layer has an icon, production shading and a count per burg. Orogen's own lesson: never let paleness also carry strain identity (`farming-cradles-map` memory).
- **Icons only when zoomed in**, so the overview stays readable (EU4, Civ).
- **Hover that explains why**: EU4's modifiers, RimWorld's tile inspector, Vic3's tooltips, Orogen's Geology hover ("how it came to be there"). Food readouts should say *why*: "two harvests: monsoon rice, then winter wheat; alluvial soil".
- **Scarcity creates stories**: Anno's fertilities, Civ's "each luxury once". A map where everything grows everywhere is boring. Narrow niches (olive, tea, spice) and gaps are what make trade, war and luxury.
- **Hazards tied to climate**: Vic3's harvest conditions.
- **Food versus luxury**: Imperator and Civ.

---

## 3. Other world and map generators

### 3.1 Azgaar's Fantasy Map Generator (read in its GitHub repo)
- **Culture types** **[read]**: https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Culture-types. Assigned by where the culture's centre spawns, first match wins:
  - **Nomadic**: hot desert, cold desert or grassland, height < 70.
  - **Highland**: height > 50.
  - **Lake**: next to a lake over 5 cells.
  - **Naval**: coast, with random checks (10 % for a non-lake coast, 60 % for a one-cell harbour, 40 % for an island).
  - **River**: a river of flux > 100.
  - **Hunting**: savanna, either rainforest, taiga, tundra or wetland, more than 2 cells from the coast.
  - **Generic**: everything else.
  - The type changes only **expansion costs**: expansionism Nomadic and Naval 1.5, Highland 1.2, River 0.9, Lake 0.8, Hunting 0.7, Generic 1. Biome, water, height and river penalties apply too, e.g. nomads pay 10× in forest.
- **Biome habitability** **[read]**: `src/model/physical/biomes-generator.ts`. Values are percentages:
  - Temperate deciduous forest 100
  - Temperate rainforest 90
  - **Tropical rainforest 80**
  - Tropical seasonal forest 50
  - Grassland 30
  - Savanna 22
  - Taiga 12
  - Wetland 12
  - Cold desert 10
  - Hot desert 4
  - Tundra 4
  - Glacier 0
  - Marine 0
- **Population** **[read]**: `src/model/society/population-generator.ts`. Score = habitability + normalised (river flux + confluence) × 250 − (height − 50)/5 + coast bonuses (estuary 15, ocean 5, safe harbour 20, freshwater lake 30, salt lake 10, …) + nearby goods value. Rural population = score × cell area.
  - **No seasons, soils, crops or irrigation.** Rainforest scores 80 % as habitable as the best land, so rainforests fill with people. (Orogen's People view fixed this exact flaw, with long fallows on poor ground.)
- **Economy, v1.124.0 (June 2026), new** **[read]**: `docs/updates/v1.124.0/v1.124.0 - Economy.md`, `docs/wiki/Goods-spread-functions.md`, `docs/domain/goods_schema.md`
  - Goods are raw, manufactured or hybrid. Regional markets set prices; trade flows are animated; states collect taxes. Trade tariffs and embargoes came in v1.155.0 (Oct 2026).
  - **Raw goods are placed one per cell by a JS "distribution" expression**, capped at ⌈200 × cells / 5000⌉ cells per good. Defaults:
    - Grain `minHabitability(20) && habitability()`
    - Cattle and Sheep `(biome(3,4) && !elevation()) || (biome(6) && random(70)) || (biome(5) && nth(5))`
    - Fish `shore(-1) && …`
    - Wine `biome(6) || (biome(4) && random(50) && river())`
    - Olives `biome(3) && shore(1,2)` (savanna coast, not a Mediterranean climate)
    - Honey `biome(6,8,9)`
    - Salt: salt lakes, deserts, wetlands
    - Dates `biome(1)`
    - Spices and Silk `biome(7)` (rainforest)
    - Camels `biome(1,2)`
    - Horses `biome(3) || …`
  - The **Goods layer** shows resource icons, production shading and a count per burg. The Goods Editor picks which goods to show, and a Distribution Editor builds rules from biome, elevation, temperature, shore and river.
- User asks on its tracker:
  - #268 "Resource layer suggestion": food near villages, metal in mountains, magic crystals in odd places. https://github.com/Azgaar/Fantasy-Map-Generator/issues/268
  - #408, culture-based urbanisation and density. https://github.com/Azgaar/Fantasy-Map-Generator/issues/408
- In Orogen's feedback review (§6), **Azgaar is the tool people are sent to "for culture and countries"**.
- **What it lacks:** goods placed by biome lists plus random thinning, not by climate niche; no monthly climate, growing season, harvests, irrigation or staples; no famine or risk; no spread over time.

### 3.2 Martin O'Leary's terrain and map generator
- Code **[read]**: https://github.com/mewo2/terrain (`terrain.js`). `cityScore` = √(water flux), minus heavy penalties near map edges and near existing cities. Cities sit on big rivers, spaced out. Nothing about food. (The writeup at https://mewo2.com/notes/terrain/ returned 404 today.)

### 3.3 WorldEngine (Mindwerks)
- Docs **[snippet]**: https://worldengine.readthedocs.io/en/latest/biomes.html. Repo **[read]**: https://github.com/Mindwerks/worldengine
  - Simulations: temperature, precipitation, erosion, hydrology, humidity, **"irrigation"** (in the code, a log-falloff of moisture from nearby ocean cells, not farming), permeability, ice caps. Biomes from **Holdridge life zones**, about 40 classes. Nothing about food or people.

### 3.4 Undiscovered Worlds
- Blog **[read]**: https://undiscoveredworlds.blogspot.com/. January and July temperature and rain extrapolated by obliquity and eccentricity, monthly river flow, springs, valleys, a zoomable globe. No agriculture, people or cultures, and none planned.

### 3.5 Gleba (Calandiel)
- itch.io **[read]**: https://calandiel.itch.io/gleba. Plate tectonics, magma and bedrock, a climate model (rain and temperature through the year), soil transport and erosion, glaciers, and plant growth for four groups (grasses, shrubs, conifers, broadleaf). No agriculture or people yet ("procedurally generated worlds and stories" is the goal). In Orogen's feedback it is the most common comparison: more detailed, desktop only.

### 3.6 Experilous procedural planets
- **[knowledge]** https://experilous.com/1/blog/post/procedural-planet-generation. Plates → elevation → air currents → temperature and moisture → biomes. Nothing about people.

### 3.7 Worldographer (Inkwell Ideas)
- **[snippet]** https://inkwellideas.com/2017/12/worldographer-updated/, https://inkwellideas.com/2018/06/hexographer-vs-worldographer/. Each hex can hold a list of resources. It generates coasts, rivers, empires, cultures and religions. Hand-edited, not simulated.

### 3.8 Dwarf Fortress world generation
- See §2.7. Plants by biome and season; civilizations placed by biome preference; history simulated. The strongest "food shapes civilization" generator, but its ASCII map output isn't for cartographers.

### 3.9 Competitors in Orogen's own feedback review (`reports/User feedback review 2026-09.md`, §6)
- **Merak Map Maker** ("new and rising, Aug–Sep 2026"): heightmap → 3D terrain and globe, biomes, **river placement, settlement suggestions, soil types and farming, society type per area**. A commenter said "the river placement logic alone saved me hours". I could not find its public page today.
- **Ardexa's generator** (unreleased, a 112-comment thread): tectonics → climate, rivers, biomes, **settlements, realms, names**. Commenters said it "reminds me of world orogen".
- Request #15 in the review, "Settlements, civilizations and resources": about 3 people, plus "other tools offer it".

### 3.10 The real-world science analogue: FAO/IIASA GAEZ
- GAEZ v4 **[snippet]**: https://www.fao.org/gaez/gaezv4/en; model docs https://international.ipums.org/international/resources/misc_docs/GAEZ.pdf
  - **Crop suitability and potential yield for about 51 crops, rain-fed against irrigated, at low or high input levels.** Classes run from very suitable through suitable, moderately, marginally and very marginally suitable, to not suitable. Inputs are length of growing period and thermal and moisture regimes.
  - This is the scientific counterpart of Orogen's Farmland view and a defensible model for per-crop niche maps.

### 3.11 What's missing across generators
1. **Seasons of food**: when the harvest comes, the lean months, festivals. Nobody does it; Orogen has monthly climate.
2. **Risk and famine**: no generator maps harvest reliability or hazards. Vic3 shows it can be a map.
3. **Luxuries and trade goods placed by climate niche**: Azgaar places goods by biome lists plus `random()`, and none uses monthly climate.
4. **Time and spread**: no generator shows when farming arrives, or crop origins and frontiers.
5. **Cuisine-level outputs** writers can use straight away: cooking fat, drink, draft and riding animal.
6. **"Why" explanations** on hover.
7. **Plausible density**: Azgaar's rainforest fills up; Orogen already does better.

---

## 4. Real food maps: what makes them compelling

### 4.1 Neolithic spread of farming (isochrones from radiocarbon dates)
- Ammerman & Cavalli-Sforza 1971: 53 sites, about 1 km/yr "wave of advance". Pinhasi, Fort & Ammerman 2005, *PLoS Biology* 3(12):e410 **[read]**: https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.0030410
  - 735 dated sites; speed **0.6–1.3 km/yr**; the origin most likely in north-east Syria, northern Mesopotamia and south-east Turkey (near Çayönü).
  - **Shortest-path distances that treat the Mediterranean as a barrier beat great-circle distances.** Geography bends the front.
  - The map uses kriged bands, darkest at R > 0.811.
- Front definition and later work **[snippet]**: https://pmc.ncbi.nlm.nih.gov/articles/PMC5293084, https://pmc.ncbi.nlm.nih.gov/articles/PMC4652622, Science News "Waves of Grain": https://www.sciencenews.org/article/waves-grain-new-data-lift-old-model-agricultures-origins
  - The front is "the line that separates … regions where agriculture is present from those where it has not yet arrived".
  - With 14,535 dates (2017), the spread comes in **pulses with pauses**, not a steady wave.
  - **The coastal route was much faster than the inland wave**: western Mediterranean coast > 5 km/yr (Isern et al., PNAS 2017), against ~1 km/yr overall. The Danube/LBK route is a separate path, also faster than average across the loess.
  - **[knowledge]** Farming stalled for 1–1.5 thousand years at the edge of the loess and boreal north before reaching Britain and Scandinavia around 4000 BC.
- **Why these maps grip people:** they show **time as colour bands**. The fronts **bend along geography** (fast along coasts and loess, stalled at mountains and the cold edge), and the stalls and leaps **feel like contingency and story**.

### 4.2 Europe's butter / olive-oil line and the beer / wine / spirits belts
- Brilliant Maps, butter vs olive oil **[read]**: https://brilliantmaps.com/butter-vs-olive-oil/. Three classes (butter yellow, olive oil dark green, mixed light green), from Statista, Euromonitor and Landgeist data. Landgeist **[snippet]**: https://landgeist.com/2021/09/23/butter-or-olive-oil. Milhaud **[snippet]**: https://mapasmilhaud.com/en/?p=2959
- **[knowledge]** The olive line almost follows the **olive tree's frost limit**, the edge of the Cs climate. That makes it one of the clearest climate → culture lines anywhere.
- Alcohol belts **[snippet]**: Big Think, Strange Maps #442: https://bigthink.com/strange-maps/442-distilled-geography-europes-alcohol-belts/; Datawrapper: https://www.datawrapper.de/blog/europe-map-alcohol-consumption
  - Spirits in the north, beer in the middle, wine in the south. The vine's northern limit is given as anywhere from about 41–44° N to 50–51° N.
  - Caveat: stereotypes, and they have drifted over time.
- **Why they grip people:** two or three classes, **a crisp line that tracks a physical limit** (frost, the vine's season), and it explains everyday culture (what you cook in, what you drink).

### 4.3 Whittlesey's agricultural regions (1936)
- *Annals of the AAG* 26:199–240. Summary **[read]**: https://mappingaround.in/?p=5193
- Five criteria: crop and livestock mix; intensity of labour and capital; productivity; consumption (home or sale); methods.
- **13 types:**
  1. nomadic herding
  2. shifting cultivation
  3. rudimentary sedentary tillage
  4. intensive subsistence, paddy-dominant
  5. intensive subsistence, non-paddy
  6. subsistence crop and livestock
  7. Mediterranean
  8. livestock ranching
  9. extensive commercial grain
  10. commercial grain and livestock
  11. commercial dairy
  12. horticulture
  13. plantation
  - Plus "land unused for farming".
- **Why it matters:** it classifies *ways of farming*, not crops. The pre-industrial subset (nomadic herding, shifting cultivation, rudimentary sedentary, paddy-dominant, non-paddy intensive, Mediterranean, subsistence crop + livestock) maps nearly one-to-one onto what Orogen already computes (lifestyle × staple × harvests × fallow).

### 4.4 Staple-food world maps
- FAO, "Staple foods: what do people eat?" **[snippet]**: https://www.fao.org/3/u8480e/U8480E07.htm. Rice, maize and wheat give about 60 % of the world's food energy, and 15 crops give 90 %.
- "Most commonly consumed starches per country" shows the **top two per country** **[snippet]**: https://objectivelists.com/the-most-commonly-consumed-starches-per-country. The same idea as Orogen's stripes for a close second.
- National Geographic "Staple food crops of the world" **[snippet]**: https://education.dev.nationalgeographic.org/resource/wbt-staple-food-crops-world
- Caveat **[snippet]**: production maps and consumption maps differ, because food is traded.

### 4.5 Subsistence by society (ethnographic data)
- D-PLACE EA042 "Subsistence economy: dominant activity" **[snippet]**: https://d-place.org/parameters/EA042. Categories are gathering, fishing, hunting, pastoralism, three levels of agriculture, and "two or more equal".
- Ahedo et al. 2021, *PLoS ONE*, "Let's go fishing" **[snippet]**: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8336859/. 1,290 societies; **25 % mixed economies; fishing appears in every mixed economy**.
- This supports Orogen's Lifestyle view, which keeps gatherers on rich coasts, and argues for a "mixed" reading.

### 4.6 What makes real food maps compelling (synthesis)
1. **Crisp lines that follow physical limits**: frost (olive), season length (vine), rain (the dry-farming edge), loess.
2. **Few classes**: 2–5.
3. **Time and contingency**: fronts that stall, leap along coasts, and arrive late on islands.
4. **They explain daily life**: cooking fat, drink, bread against rice.
5. **They are surprising but obvious once seen**: the "aha" of the butter line.

---

## 5. World Orogen user feedback mentioning food, agriculture or culture

- The Food tab shipped on **2026-10-30** (v2.2.0, beta). **I found no public feedback on it yet.** Web searches for "World Orogen" and "orogen.studio" with farming, culture or civilization turned up nothing about food.
  - Search hits that do exist: an X post praising the tectonics and climate (https://x.com/MoodiSadi/status/2028615667008860175); a user who generated a "mediterranean sea analog" and spent the day on its "fictional history" (https://x.com/north0fnorth/status/2047772029047177476); a "Possible Earths" gallery built on Orogen (https://possible-earths.onrender.com/about).
- From the owner's `reports/User feedback review 2026-09.md` (compiled 2026-09-29 from 11 Reddit threads read in full, about 30 more threads, GitHub and a web sweep):
  - **rumdiary** "uses the climate view to reason about where population centres and nations would arise". The owner replied that monsoon, humid subtropical and oceanic climates are "op". rumdiary also wanted "rivers before settlements".
  - **Maleficent-Ad-9474** wanted the plates view exported "to add settlements".
  - Request #15, **"Settlements, civilizations and resources"**: about 3 people, plus "other tools offer it". Status: your call (beyond a physical-planet generator).
  - Azgaar is where people are sent "for culture and countries". Merak (soil types, farming, settlement suggestions, society type) and Ardexa (settlements, realms) both sell on this.
  - A **vegetation map** was asked for in the 2026-10-19 r/mapmaking launch thread (`reddit-launch-feedback` memory).
- Orogen's GitHub issues (#16–#76, read 2026-10-31): none about food, farming or culture. The nearest is #37, export every Inspect layer.
- Not yet contacted: Madeline James, listed in `orogen-hq/pr/outreach.md` with the pitch "I turned your series into a tool". Historia Civilis is listed for "farming hearths and history" later.

---

## 6. Ideas for distinctive map modes in a science-grounded generator
(Each builds on data Orogen already has: monthly climate, soils, harvests, techniques, staples, lifestyle, people, deposits, and the crop-spread prototype on `farming-spread`.)

1. **Harvest calendar.** The month of the main harvest as a cyclic hue ring, with a second harvest striped. A companion "Lean months" view shows months since the last harvest, i.e. when stores run out. Answers festivals, seasons, the hungry gap (ACOUP; SE 125820's "they starved in the summer"). No generator does this.
2. **Harvest risk / famine hazard.** The dominant threat by class: drought (rain-fed near the dry edge), failed monsoon (rain all in one season), frost (near the cold edge), flood (low floodplains), with lightness for likelihood. Like Vic3's harvest conditions, but derived from the climate instead of scripted. Answers famine, and why people spread their crops.
3. **Farming frontier (isochrones).** When farming, or each staple, reaches each place, as contour bands from the hearths, fast along coasts and rivers and stalling at the edge of a crop's niche. Built on `farming-spread`. Answers "can they have potatoes?" and gives the map its contingency.
4. **Luxuries & trade goods by niche.** Wine, olive oil, tea, spices, sugar, dates, cocoa, honey, furs, dyes, incense, salt (salt is already a geology deposit). Each from a narrow monthly-climate niche, not biome plus `random()`. Pick one → highlight; icons at zoom; hover "grows only in …". A "scarcity" lightness makes the rare ones stand out. Answers what's traded and what's a luxury.
5. **Cooking fat & drink belts.** Butter or ghee (dairy herders), olive oil (Cs, frost-free), lard (pig forests), sesame, palm or coconut (tropics); and beer / wine / spirits / fermented milk (steppe) / rice wine. A 4–6-class categorical map whose crisp lines track the climate. Immediate cuisine texture for writers, and a glance-test winner.
6. **Herd & draft animals.** Madeline James's Part 3 clusters (cattle, sheep and goats, pigs, horses, camels, yaks, llamas and alpacas, reindeer, water buffalo), shown as the leading animal with a mount or pack mark. Answers "what are your riding animals eating?" and splits up today's single Livestock class.
7. **Hinterland / city reach.** Hover a place to get "a city of N people here needs farmland within X km". Optionally a gradient of the radius needed for a 50,000 city. Answers the top SE question (9582) and GMs' "how big can this town be?"
8. **Surplus & storable grain ("Granaries").** Storable, taxable grain per km², against tubers or herds (Madeline James's Part 4 and Scott). Shows where states *could* draw a surplus, without placing cities. A lighter stand-in for the removed Cradles view; flag it to the owner as the gray area it is.
9. **Seasonal herds (transhumance).** Arrows, rendered like the wind and current arrows, from summer to winter pastures: up into the mountains in summer, and along the steppe. From monthly pasture and snow. Distinctive, and it uses the arrow rendering Orogen already has.
10. **Diet breadth / mixed economy.** The entropy of a place's food sources: farming, herding, fish and wild food. Diverse diets are resilient; monocultures carry famine risk (Ireland). Backed by Ahedo et al.'s 25 % mixed economies. Could be a toggle on Lifestyle.

Cross-cutting design rules for all of these:
- at most ~8 hues per categorical view;
- legend chips that isolate one class;
- stripes for a close second or "could be";
- hue for the kind, lightness for the amount, never both carrying identity;
- icons only when zoomed in;
- every hover readout says *why*, in plain words;
- keep scale invariance (smoothing in km) and the phone layout, per CLAUDE.md.
