# Contrail — a personal flight logbook

Contrail is a prototype of an OpenFlights-style travel map: every flight on a world map, lifetime statistics, a review queue that catches flights you booked but never took, and entry by form, by pasted booking email, by boarding-pass screenshot or by an AI agent.

This folder is a working single-page prototype, not a finished product. It exists to pin down the design and the feature set before building the real, shareable app in its own repository. The plan for that app is below.

## Running the prototype

The page is static. Serve the folder with any web server (`npx serve contrail` or `python3 -m http.server` from inside it) and open `index.html`. Outside claude.ai there is no shared database, so flights are kept in the browser's local storage. Use **Flights → Import OpenFlights CSV** to load an export from openflights.org, and **Export CSV** to take it back out.

When the same page is published as a claude.ai Artifact it uses three runtime capabilities: a document database (the `flights` collection, which Claude can also write to directly), Claude itself for the Smart add parser, and file downloads for CSV export.

`data/ref.json` bundles 4,030 airports with scheduled service (from OurAirports), 986 airline codes and 246 aircraft types (from OpenFlights), plus ISO country codes. `data/countries-50m.json` is the Natural Earth 1:50m country map from `world-atlas`.

## What the prototype does

The **map** draws each route as a great-circle arc, weighted by how often it was flown, with upcoming trips dashed and visited countries tinted. Airports are sized by visits and open a detail card on click. A year strip under the map doubles as a filter.

**Overview** reproduces the OpenFlights analysis panel: unique airports, airlines, countries and aircraft; total distance against the Earth, the Moon and Mars; longest, shortest and average flights; the northern-, southern-, eastern- and westernmost airports; and seat, cabin and reason breakdowns. It adds home base share and the furthest airport from home.

**Insights** goes further than OpenFlights: flights and new airports per year, month and weekday patterns, top routes and airports, airlines with a flag on carriers that no longer exist (Jet Airways, Go First, Vistara), the Airbus/Boeing split, haul bands, domestic versus international, longest gap between flights, a rough CO₂ estimate and the countries in the order they were first visited.

**Review** looks for flights that probably didn't happen. It flags codeshares logged twice (TK774 and WY5774 are the same aircraft), exact duplicates, a route booked again within four days with no return in between (a rebooking whose original was never removed), days whose flights can't form one journey, and planned flights whose date has passed. Each has one-click **Not flown** and **I flew this** buttons. Run against the imported OpenFlights history it raises 25 items, which suggests the lifetime totals are overstated by a few thousand kilometres.

**Not flown** is a status, not a deletion. The flight stays in the log, drawn with a strike-through, and drops out of every statistic. It can be restored.

**Add flight** fills in airline, airport names, distance and an estimated duration as you type, and if you've flown that flight number before it pre-fills the route. **Smart add** takes pasted confirmation-email text or a boarding-pass image and has Claude return structured flights for you to confirm.

## Research: what already exists

### Open-source projects to build on

**[AirTrail](https://github.com/johanohly/AirTrail)** is the strongest base. It is SvelteKit and TypeScript, packaged for Docker, GPL-3.0, around 1.6k stars, and actively released (v3.12 in August 2026). It already imports from OpenFlights, myFlightradar24, App in the Air, Flighty, TripIt, JetLog and others; has a 2D map and a globe, statistics, multiple users and a REST API with API keys; and looks up flight numbers through adsbdb or, with a key, AeroDataBox. Two community MCP servers exist for it ([airtrail-mcp](https://github.com/jonlarson13/airtrail-mcp) and [AirTrail_MCP_server](https://github.com/maboukerfa/AirTrail_MCP_server)). What it lacks is exactly Contrail's differentiators: booking-email and boarding-pass ingestion, the review queue and a first-class "not flown" status. The catch is the licence: a distributed fork must also be GPL-3.0.

**[Jetlog](https://github.com/pbogre/jetlog)** (FastAPI, SQLite, React; GPL-2.0; about 350 stars) is smaller and simpler. It imports from myFR24 and Flighty and looks up flights through adsbdb, but has no OpenFlights import and no public API. **[perdian/flightlog](https://github.com/perdian/flightlog)** (Java, Apache-2.0) is permissively licensed but quiet. OpenFlights' own code is public but is an older PHP stack.

### Reference data

[OurAirports](https://github.com/davidmegginson/ourairports-data) is public domain and updated daily, and is the best airport source. The [OpenFlights data files](https://openflights.org/data.php) are ODbL, so they need attribution and share-alike on changes to the data; the GitHub copy is an occasional snapshot and its routes table is stale. [adsbdb](https://github.com/mrjackwills/adsbdb) is open data for aircraft, airlines and callsign routes.

### Flight lookup APIs (flight number + date → times, aircraft, status)

| API | Free tier | Paid | History |
|---|---|---|---|
| AeroDataBox (RapidAPI / API.market) | 600 units/month | ~$5–160/month | Yes; 7–30 days per request depending on plan. Best value. |
| AviationStack | 100 requests/month | $50–500/month | Rolling 12 months, paid only |
| AirLabs | 1,000 calls/month | $49–499/month | Limited |
| FlightAware AeroAPI | $5/month credit on the Personal tier | Pay per query | Back to 2011 (may not be on Personal) |
| Flightradar24 API | None | $9, $90, $900/month tiers | 30 days to 2+ years by tier |
| OpenSky Network | Free, non-commercial | — | Last 30 days, ICAO callsigns only |
| adsbdb | Free, no key | — | Route by callsign; no dates or status |

Only AeroDataBox, AeroAPI, AviationStack and FR24 return a cancelled or diverted status, which is what automatic "not flown" detection would need. Prices and limits come from provider pages and search results in September 2026; check them before committing.

### PNR lookup

There is no public API that returns a booking from a PNR. Airlines only expose bookings through their own "manage booking" pages, and scraping those breaks their terms and breaks often. Amadeus for Developers, the one self-service GDS API, never offered arbitrary PNR retrieval and closed its self-service portal on 17 July 2026.

The practical routes to "give it a PNR and get the flights" are the ones that start from something the traveller already holds. The confirmation email always contains the flights, and many carry schema.org `FlightReservation` markup; this is how TripIt and Flighty work, and the prototype's Smart add does it with Claude. The boarding-pass barcode (IATA BCBP) encodes the PNR, flight number, route, date and seat, and has parsers in JavaScript ([bcbp](https://github.com/georgesmith46/bcbp)) and Python. Apple Wallet `.pkpass` files are zips whose `pass.json` usually holds that same barcode.

### Consumer products and the gap

Flighty is the polished leader (iOS only, closed, $50–60/year or a lifetime licence). App in the Air shut down in October 2024. myFlightradar24 is a free diary without a public write API. TripIt is strong at email parsing but treats the log as secondary. None of them is self-hostable, open, agent-friendly and honest about flights that didn't happen. That combination is the gap.

## Plan for the shareable app

**Recommendation: fork AirTrail rather than start from scratch**, and add Contrail's differentiators as modules that could also go upstream as pull requests. That gets import formats, auth, a database, a REST API and a maintained map for free. Accept GPL-3.0 for the fork. If a permissive licence matters more (for example, to offer a hosted SaaS with proprietary parts), build fresh on the stack below and use AirTrail only as a reference.

A from-scratch stack would be Next.js or SvelteKit with MapLibre GL (vector tiles, globe projection, smooth zoom), Postgres with the OurAirports tables loaded nightly, a small worker for API lookups and email parsing, and an MCP server over the same API. It fits the existing Docker AI stack (Postgres is already there) and deploys behind the Cloudflare tunnel.

Suggested order of work:

1. **Data model.** Flights with status `flown | upcoming | cancelled | diverted`, a `source` field and a `bookingRef`; trips grouping flights; airports and airlines refreshed from OurAirports and OpenFlights.
2. **Import and review.** OpenFlights, myFR24 and Flighty CSV import, then the review queue from this prototype.
3. **Lookup.** AeroDataBox on the free tier for flight number + date autofill of times, aircraft type and registration, cached per flight so a lookup is only paid once. Nightly status check on upcoming flights to catch cancellations.
4. **Ingestion.** A forwarding address (e.g. `flights@…`) plus optional Gmail read access, parsed by schema.org markup first and an LLM second; BCBP barcode and `.pkpass` upload.
5. **MCP server.** Tools `add_flight`, `find_flights`, `mark_not_flown`, `lookup_flight`, `stats`, `import_email`, so Claude (or any agent) can keep the log without the UI.
6. **Sharing.** Public profile pages with a privacy switch per flight, and an embeddable map.

## More ideas worth building

A **year-in-review card** in the style of Spotify Wrapped, as a shareable image. An **animated replay** that flies through the log chronologically. **Airport and aircraft collection badges** (first A380, every Indian metro, 10 countries). **Loyalty and CO₂ accounting** per trip, with offsets. **Trip grouping** that stitches flights, hotel and calendar entries into journeys automatically. **Family logs**, so trips taken together are logged once and appear on everyone's map. **"Where next"**, suggesting unvisited airports reachable non-stop from home base. **Time-zone and jet-lag stats** (hours shifted per year). **Registration history**, showing when you flew the same airframe twice, using adsbdb. **Seat-map memory**, a heatmap of your preferred rows and sides per aircraft type.

## Attribution

Airports: OurAirports (public domain). Airlines and aircraft types: OpenFlights (ODbL). Country shapes: Natural Earth (public domain) via world-atlas (ISC). Map drawing: D3 and topojson-client.
