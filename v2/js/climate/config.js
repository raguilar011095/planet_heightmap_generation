// Tunable settings of the new climate, grouped by stage — a handful per stage, each with a physical meaning and a
// unit. Mutable so the tuning suite (tuning/climate/) can set them in-process; the app always uses the defaults.
// Each stage is tuned on its own against its own Earth observations, then frozen (plans/CLIMATE_REBUILD_PLAN.md).
// Tuning is light: the literature value (PARAM_PRIORS below) is the starting point and the pull; the whole Earth is
// used but every continent is scored on its own and none may end up worse than with the literature values.
// Temperature: tuned 2026-09-28 (tuning/climate/temperature-check.mjs --tune) — only the snow albedo, land heat
// store, wind heat-carrying, inversion wind and plateau lapse moved from their literature values.

export const PARAMS_DEFAULTS = Object.freeze({
    // ── Temperature (energy balance, temperature.js) ──
    TEMP_OLR_A: 203.3,          // W/m²       outgoing heat to space at 0 °C (sets the planet's overall warmth)
    TEMP_OLR_B: 2.09,           // W/m²/K     extra outgoing heat per degree warmer
    TEMP_DIFFUSIVITY: 0.65,     // W/m²/K     heat spread toward the poles by weather and ocean (unit-sphere diffusivity)
    TEMP_DIFFUSIVITY_EW: 0.3,   // W/m²/K     heat spread east–west: weaker — weather systems carry heat mainly poleward,
                                //            and land and sea exchange air mostly through the prevailing winds
    TEMP_ALBEDO: 0.30,          // –          share of sunlight reflected (clouds, surface) …
    TEMP_ALBEDO_LAT: 0.15,      // –          … plus this × P2(sin latitude): more at high latitudes (low sun, cloud)
    TEMP_ALBEDO_ICE: 0.60,      // –          reflected by sea ice, and by ground that stays snow-covered all year
    TEMP_ALBEDO_SNOW: 0.325,    // –          reflected by seasonal snow on land (forests and patchy snow keep it low);
                                //            it rises toward the ice value the longer the snow stays each year
    TEMP_ICE_WARM_C: 0,         // °C         snow / ice starts to appear below this …
    TEMP_ICE_COLD_C: -10,       // °C         … and covers everything below this (smooth in between)
    TEMP_LAND_HEAT_CAP: 8.93e6, // J/m²/K     how much heat land stores per degree (air column + top soil)
    TEMP_OCEAN_MIX_M: 50,       // m          depth of the sea's mixed layer (its heat store)
    TEMP_WIND_CARRY: 0.068,     // –          share of the air column's heat the wind carries along (mild west coasts)
    TEMP_INVERSION_C: 10,       // °C         how much colder the air near snowy ground gets than the air above it
                                //            when the sun is weak and the air calm (winter inversions over snow and ice)
    TEMP_INVERSION_WIND: 4.69,  // m/s        wind speed at which that inversion is half mixed away
    TEMP_POLAR_SUMMER_DAMP: 0.5,// –          near the poles, the share of the rise above the yearly mean that melting snow and
                                //            ice take from the summer (winters untouched; issue #74) …
    TEMP_POLAR_FROM_DEG: 65,    // °          … none equatorward of this latitude …
    TEMP_POLAR_FULL_DEG: 85,    // °          … fully poleward of this one
    TEMP_PLATEAU_LAPSE: 4.84,   // °C/km     how much colder a large region is per km of its mean height (sunlit
                                //            plateaus heat the air above them, so less than the free air's 6.5;
                                //            the terrain cells below the grid still use the standard rate) …
    TEMP_ICE_LAPSE: 8.0,        // °C/km      … and the same for ground under snow most of the year: ice sheets reflect
                                //            the sun and chill the air, so more (blended by how long the snow lasts)
    TEMP_ICE_START_C: -30,      // °C         a fresh start begins with ice sheets on land the first guess (sunlight by
                                //            latitude, no heat carried) makes colder than this (~60° and poleward on an
                                //            Earth-like planet): sheets that hold themselves stay; −Infinity = bare start
    TEMP_ICE_DOME_KM: 1.5,      // km         an ice sheet's surface stands at least this high, whatever its bedrock (its
                                //            own height keeps it cold); 0 = the bedrock's height
    TEMP_ICE_FORM: [0.8, 1],    // –          an ice sheet grows where its ground is snowy this share of the year (none
                                //            below the first, all at the second: snow that outlives most summers) …
    TEMP_ICE_KEEP: [0.76, 0.9], // –          … and a sheet once there is kept while its ground is snowy this share
    TEMP_SEA_ICE_GROW: 0.002,   // m/°C/day   sea ice thickens this much per degree-day of frost (thin ice; 0 = sea ice
                                //            from each month's cold alone, none lasting into the summer) …
    TEMP_SEA_ICE_STEFAN_M: 0.2, // m          … growing slower once thicker than this (insulated: Stefan's law; 0 = off) …
    TEMP_SEA_ICE_MELT: 0.003,   // m/°C/day   … and thins this much per degree-day of thaw
    TEMP_SEA_ICE_H0: 0.5,       // m          the sea is covered once its ice is this thick (and holds at most 6× this)
    TEMP_SEA_ICE_SPREAD_KM: 700,// km         the ice follows the sea's temperature averaged within this (a warm current's
                                //            water spreads well out from its coast; the pack drifts)
    TEMP_BLOCK_KM: 1.5,           // km         mountains block the low air's heat exchange: e^{−(ridge above the lower side)/this}; 0 = off
    TEMP_LOCAL_K: 11,            // W/m²/K     land's own seasons below the grid: a column's exchange with its surroundings (0 = off)
    TEMP_LOCAL_KM: 1925,        // km         … its departure from the region within this (Gaussian σ) is added over land
    TEMP_CURRENT_MEMORY: 0.6,     // –          share of the temperature of where its water comes from that a current keeps
    TEMP_COAST_CARRY: 0.6,      // –          … the share of the upwind sea's anomaly onshore winds carry onto land
    TEMP_AIR_SEA_DAYS: 1,       // days       air masses: time for air over the open sea to take on its temperature …
    TEMP_AIR_SUN_DAYS: 0.5,     // days       … over sunlit land (convection mixes the air) …
    TEMP_AIR_DARK_DAYS: 3,      // days       … and over land under a weak sun (stable air on colder ground); 0 = off
    TEMP_EVAP_DAMPING: 15,      // W/m²/K     evaporation's damping of the seasons over a wet surface at 25 °C
    TEMP_WET_COOL_C: 2,         // °C         how much cooler fully wet tropical ground is than dry, at 25 °C under a strong sun
    TEMP_SEA_SWING: 0.3,        // –          the sea's seasonal swing as a share of the land's (continentality below the grid)
    TEMP_CLOUD_ALBEDO: 0.262,   // –          albedo of land's clouds beyond the average (with the rain stage's rain)
    TEMP_CLOUD_LW_CANCEL: 0.8,  // –          … less this share of it in the rainy tropics (deep clouds trap about the heat they reflect)
    TEMP_ALBEDO_VARY: 0.025,    // –          the surface's own variety of brightness (soils, cover, cloudiness): smooth fractal
    TEMP_ALBEDO_VARY_KM: 900,   // km         noise up to ± this, its largest features this big — an input the energy balance
                                //            works through, so snow lines and ice-sheet edges come out irregular, by the physics
    TEMP_GRID_DEG: 1,           // °          grid the energy balance is solved on: the core grid (at 3° — Phase 6: it scored
                                //            the same at half the cost — its ice sheets came in 3° blocks, their edges
                                //            straight lines across the land; ≈ +1.5 s; Earth: 82 % of land keeps its
                                //            Köppen class, land ≈ 0.5 °C warmer — retune)

    // ── Pressure and wind (circulation.js) ──
    // Tuned 2026-09-28 (tuning/climate/circulation-check.mjs --tune: open loop, continents and ocean basins weighted
    // equally, none worse than with the literature values). Ferrel width, sea friction angle and Hadley scale ended
    // at or near the edge of their ranges — a hint of the simple structure's limits.
    CIRC_HADLEY_SCALE: 1.44,  // –          Hadley-cell width relative to Held & Hou's estimate (1.5, the range's
                                //            edge, until 2026-10-25: polar air too warm then narrowed the contrast)
    CIRC_HADLEY_SEASONAL: 0.5, // –          share of each month's own equator-to-pole contrast in the Hadley cells' width
    CIRC_FERREL_DEG: 35,        // °          from the subtropical high to the subpolar low (the Ferrel cell)
    CIRC_TROPICAL_HPA: 10.13,    // hPa        how much lower the tropical rain belt is than the subtropical highs
    CIRC_MIDLAT_HPA: 35,        // hPa        subtropical high to subpolar low over an all-sea belt at 25 K of contrast …
    CIRC_OPEN_SEA_POWER: 1.36,   // –          … × (the belt's sea share)^this: open sea lets the westerlies run free
    CIRC_POLAR_HPA: 4.75,       // hPa        how much higher the polar high is than the subpolar low
    CIRC_THERMAL_HPA_PER_K: 1, // hPa/K    thermal lows and highs: lower pressure per degree warmer than the latitude
    CIRC_HEAT_LOW_MILD: 0.963,    // –          … a heat low over mild land (≤ 15 °C) at this share of its depth over hot land (≥ 35 °C)
    CIRC_HEAT_LOW_TROPICS: 1,   // –          … and in the deep tropics (convective: the heat goes into rain) as over mild land
    CIRC_OCEAN_HIGH_HPA: 2,     // hPa        subtropical highs over the oceans: per unit of sea share above the latitude's
    CIRC_HEAT_LOW_HOT: 1,       // –          … and over hot, dry land (≥ 35 °C, outside the rainy tropics) × (1 + this): a deep boundary layer
    CIRC_COLD_HIGH_BOOST: 0.685,  // –          … a cold high over very cold land (≤ −25 °C) × (1 + this)
    CIRC_ROSSBY_KM: 812,        // km         scale the pressure responds to heating on (the Rossby radius)
    CIRC_TROUGH_MAX_LAT: 35,    // °          the tropical trough follows each longitude's warmest latitude as far as this (into the
                                //            summer heat lows: Tibet, the Sahara, Mexico, inland Australia) …
    CIRC_TROUGH_HIGH_DEG: 6,    // °          … and that longitude's subtropical high stands at least this far beyond it (one trough
                                //            with the heat low, not a ridge between them)
    CIRC_MONSOON_HPA_PER_K: 1.0, // hPa/K     a monsoon trough (drawn away from the rain belt) deeper by this per degree its heat low is warm
    CIRC_TURN_OCEAN_DEG: 12.5,    // °          surface wind turned toward low pressure by friction, over the sea …
    CIRC_TURN_LAND_DEG: 30,   // °          … and over land (rougher)
    CIRC_SURFACE_WIND: 0.75,     // –          near-surface wind as a share of the wind above the friction layer, over the sea …
    CIRC_SURFACE_WIND_LAND: 0.55, // –         … and over land (rougher)
    CIRC_GRID_DEG: 3,           // °          grid the circulation is computed on (interpolated to 1°)

    // ── Ocean (ocean.js) ──
    OCEAN_FRICTION: 6e-6,       // 1/s        east–west friction of the gyres: sets the western boundary currents' width
                                //            (r/β ≈ 300 km, two cells of the 2° grid)
    OCEAN_FRICTION_NS: 3e-7,    // 1/s        north–south friction: small, so the open ocean keeps its Sverdrup balance
    OCEAN_CHANNEL_DRAG: 7.3e-7, // 1/s        friction balancing the wind in a circumpolar channel (its current's strength)
    OCEAN_GUST_MS: 4.26,        // m/s        wind variability (storms) that monthly-mean winds leave out, for the wind stress
    OCEAN_HEAT_SHARE: 0.073,    // –          share of the gyres' transport whose temperature reaches the sea surface
    OCEAN_OVERTURN_PW: 0.6,     // PW         the overturning's poleward heat, per hemisphere open to the polar sea, given
                                //            up beyond 40° (the Atlantic carries ≈ 0.6 PW across 45°N, Trenberth & Caron
                                //            2001; 0.925 while a fifth of it leaked through the Bering Strait, issue #74)
    OCEAN_MERID_SHARE: 0.03,   // –          … and of their north–south transport across the latitudes' temperature gradient
    OCEAN_UPWELL_DT: 6,         // °C         how much colder upwelled water is than the surface where the thermocline is shallowest …
    OCEAN_THERMO_EAST_M: 50,    // m          … the thermocline's depth at a basin's eastern shore (where it is shallowest) …
    OCEAN_THERMO_SCALE_M: 70,   // m          … and the upwelled water's coldness fading by e for each this much deeper (the warm pool)
    OCEAN_THERMO_EQ_M: 100,     // m          … the equator's mean thermocline depth, about which the winds tilt it …
    OCEAN_SHORE_KM: 600,        // km         … across each basin, shore to shore: land at least this wide along a latitude (smaller
                                //            islands the ocean's slow adjustment passes round)
    OCEAN_GPRIME: 0.03,         // m/s²       reduced gravity across the thermocline (how far the winds can tilt it)
    OCEAN_EQ_DEG: 6,            // °          the equatorial waveguide: the trade winds tilt the thermocline within this (e-folding);
                                //            beyond, the gyres' Ekman pumping sets its depth (Sverdrup)
    OCEAN_EKMAN_TAUY_DEG: 5,    // °          within this of the equator a north–south wind stress drives no sideways (Ekman) drift (e-folding)
    OCEAN_COAST_KM: 300,        // km         coastal upwelling wells up within this of the coast (the zone and its filaments)
    OCEAN_COAST_LAND_SHARE: 0.35, // –        … fully where at least this share of the zone around the coast is land (a continent's
                                //            coast); round a small island the water pushed offshore is made up from its other side
    OCEAN_QFLUX_MAX: 150,       // W/m²       cap on the ocean's local heating or cooling of the surface layer
    OCEAN_CURRENT_DEPTH_M: 200, // m          depth the gyres' transport is spread over, for surface current speed (display)
    OCEAN_GRID_DEG: 1,          // °          grid the ocean is computed on (the core grid: coastal upwelling and boundary
                                //            currents hug the coasts — at 3° they were blobs a coarse cell wide; ≈ +1 s;
                                //            Earth: 88 % of land keeps its Köppen class, land ≈ 1 °C warmer — retune)
    OCEAN_SEASON_SCALE: 1,      // –          strength of the gyres' seasonal cycle (0: the year's gyres all year, as before)
    OCEAN_SEASON_FULL_DEG: 10,  // °          the gyres follow the season's winds fully within this latitude …
    OCEAN_SEASON_ZERO_DEG: 60,  // °          … and not at all from this one (slower planetary waves: years to adjust)

    // ── Rain (rain.js) ──
    RAIN_EVAP_COEFF: 1.3e-3,    // –          bulk transfer coefficient for evaporation
    RAIN_SURFACE_RH: 0.8,       // –          relative humidity of the air just above the sea (sets evaporation)
    RAIN_VAPOUR_HEIGHT_KM: 2.5, // km         scale height of water vapour (saturated column = ρ·q_sat·H)
    RAIN_TERRAIN_HEIGHT_KM: 4,  // km         … and of the column's water over heated high ground (the moist layer rides up with it) …
    RAIN_TIMESCALE_H: 1.86,     // h          rain-out time of a saturated column …
    RAIN_RH_STEEPNESS: 12.4,    // –          … and how steeply rain grows with the column's relative humidity
    RAIN_EDDY_DIFF: 6e5,        // m²/s       moisture mixing by weather systems: everywhere …
    RAIN_EDDY_LENGTH_KM: 1100,  // km         … plus the storms' (mixing length L: K = σ_Eady·L²)
    RAIN_STORM_RH: 0.263,       // day        spread of the column's relative humidity by storms, per unit Eady growth rate
    RAIN_TROPICAL_RH: 0.3,      // day        … and by tropical disturbances (monsoon depressions, easterly waves), per unit of the
    RAIN_TROPICAL_KM: 600,      // km         low-level winds' cyclonic vorticity (1/day), smoothed over this, within the tropics
                                //            (the derived winds are smooth: their vorticity is ≈ ¼ of a real monsoon trough's)
    RAIN_WIND_ROT: 0.757,       // –          rotational wind carrying the column's water, as a share of the wind above the friction layer …
    RAIN_WIND_DIV_DRY: 0.3,     // –          … and the divergent (converging / spreading) part, as a share of the near-surface
    RAIN_WIND_DIV_MOIST: 0.6,   //            wind: under dry air (a shallow layer), and in moist convecting air (a deep one)
    RAIN_DEEP_R0: 0.6,          // –          column relative humidity where the converging layer starts to deepen …
    RAIN_DEEP_R1: 0.9,          //            … and where it is fully deep (moist convection)
    RAIN_STABILITY: 0.0225,     // 1/K        humidity effectively lost per K the surface is colder than its region (stable air) …
    RAIN_STABLE_REF_KM: 1500,   // km         … the region: the surface's mean within this (Gaussian σ; the air mass's scale)
    RAIN_TERRAIN_HEAT_K: 6,     // K          … over ground this much warmer than its latitude (at sea level); none if 0
    RAIN_HIGH_K_PER_HPA: 0.6,     // K/hPa      stability counted per hPa of pressure above the latitude's mean (sinking air)
    RAIN_INSTABILITY: 0.0187,        // 1/K        … and gained per K a sea is warmer (unstable air off warm currents, warm currents)
    RAIN_FRONT_MM: 10,          // mm/month   the polar front's baseline rain over land at its centre …
    RAIN_FRONT_POS: 0.5,        // –          … the front this share of the way from each hemisphere's subtropical high to its subpolar low …
    RAIN_FRONT_DEG: 10,         // °          … its band (Gaussian σ) …
    RAIN_FRONT_HIGH_HPA: 4,     // hPa        … faded by e per this much pressure above the latitude's mean (the highs)
    RAIN_SOIL_MM: 87.5,         // mm         water the soil holds for evaporation in dry months
    RAIN_LAND_CONVECTION: 0.065, // –         spread of the column's relative humidity by afternoon storms over sunlit, wet land
    RAIN_COLUMN_LOCAL: 0.2,     // –          share of the surface's departure from its latitude's temperature felt through the air column
    RAIN_OROG_STORM: 1,         // –          share of the storms' wind speed (Eady rate × their size) in the lift over mountains
    RAIN_LEE_PER_KM: 1,         // 1/km       rain shadows on the 1° grid: rain × e^{−this × km the air has come down from higher ground}
    RAIN_LEE_RECOVER_KM: 400,   // km         … a drop counted less with distance (the air takes up moisture again)
    RAIN_RISE_PER_KM: 0.5,      // 1/km       windward slopes wetter with height: rain × e^{this × km the air has been lifted on its way}
    RAIN_ISLAND_BOOST: 2,       // –          islands wetter than the sea around them: × (1 + this × sea share around × warmth)
    RAIN_OROG_SPREAD_KM: 600,   // km         windward / lee rain is moved within this distance, not made
    RAIN_SLOPE_FACTOR: 1.2,     // –          windward / lee rain on the 1° grid: × e^{β·(upslope speed / 0.1 m/s)}
    RAIN_OROGRAPHIC: 0.6,       // –          share of the water lifted by winds blowing up rising ground that rains out
    RAIN_NEWTON: 30,            //            at most this many Newton steps per point in the year …
    RAIN_TOL: 2e-3,             //            … stopping when the column water changes less than this (relative)
    RAIN_CYCLES: 4,             //            multigrid cycles per Newton step
    RAIN_POISSON_CYCLES: 6,     //            … for the wind's divergent part (each point starting from the last) …
    RAIN_CARRIER_CYCLES: 4,     //            … and for the stability the air carries
    RAIN_GRID_DEG: 3,           // °          grid the rain is computed on (interpolated to 1°)
});

export const PARAMS = { ...PARAMS_DEFAULTS };

// What each tunable is expected to be on any Earth-like planet: a literature value and a physically plausible
// range. Tuning against Earth may only nudge a setting within its range and pays for moving away from the
// literature value, so the result stays a set of physical constants rather than a fit to Earth's geography.
export const PARAM_PRIORS = Object.freeze({
    TEMP_OLR_A:         { value: 203.3, min: 195, max: 215, source: 'North & Coakley 1979, satellite OLR fit' },
    TEMP_OLR_B:         { value: 2.09, min: 1.6, max: 2.4, source: 'North & Coakley 1979; Graves et al. 1993 (1.5–2.2)' },
    TEMP_DIFFUSIVITY:   { value: 0.65, min: 0.3, max: 1.0, source: 'North 1981 (0.649); North, Mengel & Short 1983 (≈0.67)' },
    TEMP_ALBEDO:        { value: 0.30, min: 0.25, max: 0.35, source: "Earth's planetary albedo ≈ 0.30" },
    TEMP_ALBEDO_LAT:    { value: 0.15, min: 0.0, max: 0.25, source: 'North 1975 P2 albedo term (0.2 incl. ice)' },
    TEMP_ALBEDO_ICE:    { value: 0.60, min: 0.45, max: 0.70, source: 'North 1975 ice-cap albedo 0.62' },
    TEMP_ALBEDO_SNOW:   { value: 0.40, min: 0.30, max: 0.60, source: 'snow-covered forest ≈ 0.2–0.35, open snow 0.6–0.8; seasonal snow is patchy' },
    TEMP_LAND_HEAT_CAP: { value: 8.4e6, min: 3e6, max: 2e7, source: '≈ 2 m water equivalent (air column + top soil)' },
    TEMP_OCEAN_MIX_M:   { value: 50, min: 25, max: 100, source: 'ocean mixed layer, 30–100 m' },
    TEMP_DIFFUSIVITY_EW: { value: 0.3, min: 0.05, max: 1.0, source: 'eddy heat flux is mainly meridional (v′T′ ≫ u′T′); east–west exchange by the mean winds' },
    TEMP_WIND_CARRY:    { value: 0.05, min: 0.0, max: 0.30, source: 'share of the air column\'s heat the (near-surface) wind carries; no direct literature value — bounded by the whole column moving at about the surface wind' },
    TEMP_INVERSION_C:   { value: 10, min: 5, max: 15, source: 'Arctic winter surface inversions ≈ 10–15 K (Serreze et al. 1992); strongest in the dark over snow' },
    TEMP_INVERSION_WIND: { value: 5, min: 3, max: 8, source: 'stable boundary layers break down above ≈ 5–7 m/s near-surface wind' },
    TEMP_PLATEAU_LAPSE: { value: 5.0, min: 4.0, max: 6.5, source: 'near-surface lapse rates over large elevated terrain ≈ 4.5–5.5 °C/km (elevated heating)' },
    TEMP_BLOCK_KM:      { value: 1.5, min: 0.8, max: 3, source: 'the marine / boundary layer a range must lift the air out of is ≈ 1–2 km deep; cold-air damming and blocked flow below ridge height (Froude < 1)' },
    TEMP_LOCAL_K:       { value: 6, min: 3, max: 15, source: 'advective exchange of a ~1.5 km boundary layer at ~5 m/s over ~1000 km: ρ c_p H U / L ≈ 9 W/m²/K' },
    TEMP_CURRENT_MEMORY: { value: 0.6, min: 0.2, max: 1, source: 'western boundary currents run ≈ 2–5 °C warmer and eastern boundary currents ≈ 2–4 °C colder than their latitude (OISST) — against ≈ 6–10 °C of latitude temperature change along ≈ 1500 km of their path' },
    TEMP_COAST_CARRY:   { value: 0.6, min: 0.2, max: 1, source: 'onshore winds carry the sea\'s warmth or cold a few hundred km inland (the maritime west coasts; the cool coastal deserts beside cold currents)' },
    TEMP_AIR_SEA_DAYS:  { value: 1, min: 0.3, max: 2, source: 'air-mass transformation over the sea: cold-air outbreaks warm ≈ 5–10 K within a day over open water (heat fluxes of 200–500 W/m² into a ≈ 1 km boundary layer)' },
    TEMP_AIR_SUN_DAYS:  { value: 1, min: 0.5, max: 2, source: 'a sunlit convective boundary layer (1–2 km) takes on its surface\'s heating within a day or two (sensible heat 100–300 W/m²)' },
    TEMP_AIR_DARK_DAYS: { value: 6, min: 3, max: 12, source: 'maritime air over snowy winter continents cools ≈ 1–2 K/day (radiative loss from a stable boundary layer): a 10–20 K contrast lasts about a week — Atlantic air keeps Europe mild 2000–3000 km inland' },
    TEMP_LOCAL_KM:      { value: 1500, min: 800, max: 2500, source: 'the scale of the weather systems whose heat transport the diffusion stands for (≈ 1000–2000 km)' },
    TEMP_EVAP_DAMPING:  { value: 15, min: 5, max: 30, source: 'sensitivity of the surface latent heat flux to temperature ≈ 10–20 W/m²/K over tropical oceans and wet land (e.g. Hartmann 2016; Zhang & McPhaden 1995)' },
    TEMP_WET_COOL_C:    { value: 3, min: 1, max: 8, source: 'soil-moisture–temperature coupling: dry soils raise monthly mean temperature by several K (Seneviratne et al. 2010); Sahel pre-monsoon vs monsoon months ≈ 5–6 K; tropical deforestation +1–3 K' },
    TEMP_SEA_SWING:     { value: 0.3, min: 0.15, max: 0.5, source: 'mid-latitude sea-surface seasonal range ≈ 5–10 °C vs ≈ 20–40 °C over continents' },
    TEMP_ALBEDO_VARY:   { value: 0.025, min: 0, max: 0.05, source: 'regional variation of surface and cloud albedo about the zonal mean ≈ ±0.02–0.05 (ERBE / CERES clear-sky and all-sky maps)' },
    TEMP_ALBEDO_VARY_KM: { value: 900, min: 400, max: 2000, source: 'the size of regional albedo anomalies (deserts, forests, cloud decks) ≈ 500–2000 km' },
    TEMP_CLOUD_ALBEDO:  { value: 0.15, min: 0.0, max: 0.3, source: 'shortwave cloud forcing over land ≈ −50 to −100 W/m² under persistent rain clouds, ≈ 0 over deserts (CERES): an albedo contrast ≈ 0.1–0.25' },
    TEMP_CLOUD_LW_CANCEL: { value: 0.8, min: 0.5, max: 1, source: 'deep tropical convection: shortwave cloud forcing ≈ −100 W/m² nearly cancelled by longwave ≈ +90 W/m² (Kiehl 1994; Hartmann et al. 2001; ERBE/CERES)' },
    TEMP_ICE_LAPSE:     { value: 8.0, min: 6.5, max: 10, source: 'Antarctic ice-sheet surface temperature vs height ≈ 8 K/km (Fortuin & Oerlemans 1990)' },
    TEMP_ICE_DOME_KM:   { value: 1.5, min: 0.5, max: 3, source: 'mean surface elevation of ice sheets ≈ 2.1 km (Greenland) and 2.3 km (Antarctica); small ice caps less' },
    TEMP_SEA_ICE_GROW:  { value: 0.002, min: 0.001, max: 0.004, source: 'thin sea ice grows ≈ 1–3 cm/day at −10 °C (Stefan / Lebedev: h ≈ 1.33·FDD^0.58 cm)' },
    TEMP_SEA_ICE_STEFAN_M: { value: 0.2, min: 0.1, max: 0.4, source: 'first-year ice reaches ≈ 1–2 m after a winter of 2000–5000 °C·days (Lebedev 1938; Maykut 1986)' },
    TEMP_SEA_ICE_MELT:  { value: 0.003, min: 0.002, max: 0.006, source: 'summer surface melt ≈ 0.5–1.5 m over a season of a few hundred positive degree-days (Perovich et al. 2003)' },
    TEMP_SEA_ICE_H0:    { value: 0.5, min: 0.3, max: 1, source: 'ice ≈ 0.3–1 m thick closes the sea (consolidated pack vs new ice and leads)' },
    TEMP_SEA_ICE_SPREAD_KM: { value: 700, min: 300, max: 1200, source: 'sea-ice drift ≈ 5–10 km/day — a few hundred to a thousand km over a season (IABP buoys)' },
    TEMP_POLAR_SUMMER_DAMP: { value: 0.5, min: 0.2, max: 0.7, source: 'Arctic summers: the surface stays near 0 °C while snow and sea ice melt, and the July 10 °C isotherm (the tree line) lies near 65–72°N on every continent; land poleward of 75° is tundra or ice everywhere on Earth (Beck et al. 2023). No direct value — set so the model\'s 66–80°N summers match, winters untouched' },
    TEMP_ICE_START_C:   { value: -30, min: -40, max: -20, source: 'ice-sheet hysteresis: once grown, polar ice sheets persist under climates that would not grow them (e.g. DeConto & Pollard 2003; Abe-Ouchi et al. 2013)' },

    CIRC_HADLEY_SCALE:  { value: 1.2, min: 0.9, max: 1.5, source: 'Held & Hou 1980 underestimates the observed Hadley edge by ~20 % (e.g. Frierson et al. 2007)' },
    CIRC_HADLEY_SEASONAL: { value: 0.5, min: 0, max: 1, source: 'observed subtropical highs migrate ≈ 10° with the rain belt (NCEP); Held & Hou per month would cancel it; seasonal Hadley cells are not in equilibrium with each month (Lindzen & Hou 1988)' },
    CIRC_FERREL_DEG:    { value: 30, min: 20, max: 35, source: 'subtropical highs ≈ 30°, subpolar lows ≈ 60° (three-cell circulation)' },
    CIRC_TROPICAL_HPA:  { value: 9, min: 5, max: 14, source: 'zonal-mean sea-level pressure ≈ 1009 hPa in the rain belt vs ≈ 1018 in the subtropical highs' },
    CIRC_MIDLAT_HPA:    { value: 35, min: 25, max: 45, source: 'zonal-mean sea-level pressure over the Southern Ocean: ≈ 1018 hPa at 35°S to ≈ 987 at 65°S, both seasons (NCEP)' },
    CIRC_OPEN_SEA_POWER: { value: 2.3, min: 1, max: 3.5, source: 'the land-broken northern belt (≈ 45 % sea) has a zonal-mean trough of only ≈ 6 hPa in both seasons vs ≈ 30 over the ≈ 93 % sea south (NCEP): (0.45/0.93)^p ≈ 1/5' },
    CIRC_POLAR_HPA:     { value: 6, min: 2, max: 12, source: 'polar highs a few hPa above the subpolar troughs' },
    CIRC_HEAT_LOW_MILD: { value: 0.4, min: 0.1, max: 1, source: 'heat lows are deep (≈ 10 hPa) over hot, dry interiors with a 3–5 km boundary layer and weak over mild, moist land (summer Europe: the Azores ridge, not a low; NCEP)' },
    CIRC_HEAT_LOW_TROPICS: { value: 1, min: 0, max: 1, source: 'the deep heat lows sit in the dry subtropics (Sahara ≈ 25°N, Pakistan ≈ 30°N, Pilbara ≈ 21°S, Kalahari ≈ 20°S), not over the convective wet tropics (NCEP)' },
    CIRC_OCEAN_HIGH_HPA: { value: 8, min: 0, max: 16, source: 'winter subtropical highs over the oceans (Azores ≈ 1024 hPa at 35°N) vs the land beside them (Sahara ≈ 1018): ≈ 6–8 hPa across ≈ ±0.5 of sea share (NCEP)' },
    CIRC_HEAT_LOW_HOT:  { value: 0.5, min: 0, max: 1.5, source: 'heat lows over hot deserts reach 10–20 hPa below the latitude mean (Pakistan ≈ 996 hPa in July): the heated boundary layer is 3–5 km deep, several times that over mild land or sea (NCEP)' },
    CIRC_COLD_HIGH_BOOST: { value: 0.5, min: 0, max: 1.5, source: 'cold anticyclones strengthen as the surface inversion deepens over very cold snow (Siberian high ≈ 1035 hPa at −30 °C)' },
    CIRC_THERMAL_HPA_PER_K: { value: 1.0, min: 0.4, max: 1.6, source: 'hydrostatic: warming the lowest 2–3 km by 1 K lowers surface pressure ≈ 0.9–1.3 hPa' },
    CIRC_TROUGH_MAX_LAT: { value: 35, min: 28, max: 40, source: 'the summer monsoon trough joins the heat lows of Pakistan and Tibet (≈ 28–35°N), the Sahara (≈ 20–25°N), Arizona (≈ 33°N), the Pilbara (≈ 22°S) (NCEP)' },
    CIRC_TROUGH_HIGH_DEG: { value: 6, min: 4, max: 12, source: 'over a summer continent the subtropical ridge lies poleward of the heat low (the Tibetan High aloft and the westerlies beyond ≈ 40°N in July)' },
    CIRC_MONSOON_HPA_PER_K: { value: 1.0, min: 0.5, max: 2, source: 'summer monsoon troughs below the rain belt (≈ 1010 hPa): South Asia ≈ 996–1000 hPa over a ≈ 10 K heat low (Tibet heating the air aloft), the Sahara ≈ 1008 over ≈ 3 K (NCEP July)' },
    CIRC_ROSSBY_KM:     { value: 1000, min: 500, max: 2000, source: 'Rossby radius of deformation ≈ 1000 km in midlatitudes' },
    CIRC_TURN_OCEAN_DEG: { value: 20, min: 10, max: 30, source: 'surface wind crosses isobars at ≈ 10–20° over the sea' },
    CIRC_TURN_LAND_DEG: { value: 35, min: 25, max: 45, source: '… and ≈ 30–45° over land' },
    CIRC_SURFACE_WIND:  { value: 0.7, min: 0.5, max: 0.9, source: 'near-surface wind ≈ 0.6–0.8 of the geostrophic wind over the sea' },
    CIRC_SURFACE_WIND_LAND: { value: 0.5, min: 0.3, max: 0.7, source: '10 m wind over land ≈ 0.4–0.6 of the geostrophic wind (roughness)' },

    OCEAN_FRICTION:     { value: 6e-6, min: 3e-6, max: 1.5e-5, source: 'Stommel layer width r/β should span ≈ 2 grid cells (MITgcm guidance); ≈ 300 km at 2°' },
    OCEAN_GUST_MS:      { value: 6, min: 3, max: 9, source: 'bulk formulas on climatological winds add a gustiness / synoptic speed of a few m/s' },
    OCEAN_CHANNEL_DRAG: { value: 5e-7, min: 1e-7, max: 2e-6, source: 'sets a circumpolar current of ≈ 100–150 Sv on Earth (the ACC)' },
    OCEAN_HEAT_SHARE:   { value: 0.05, min: 0.01, max: 0.2, source: 'scaled to the ocean\'s ≈ 1–2 PW poleward heat transport; no direct literature value' },
    OCEAN_OVERTURN_PW:  { value: 1.0, min: 0.4, max: 1.5, source: 'Atlantic meridional overturning heat transport ≈ 1.2 PW at 26°N (RAPID array), released in the subpolar and Nordic seas' },
    OCEAN_MERID_SHARE:  { value: 0.15, min: 0.03, max: 0.4, source: 'western boundary currents release ≈ 100–200 W/m² (Gulf Stream, Kuroshio), eastern boundary currents take up ≈ 20–50 W/m² plus upwelling (Yu & Weller 2007 OAFlux); the gyres carry ≈ 1 PW poleward' },
    OCEAN_UPWELL_DT:    { value: 6, min: 3, max: 10, source: 'upwelling under a shallow thermocline cools the surface 5–10 °C below its latitude (Peru, Benguela, the east Pacific cold tongue)' },
    OCEAN_THERMO_EAST_M: { value: 50, min: 30, max: 80, source: 'the thermocline at the eastern ocean margins ≈ 30–60 m deep (east Pacific, Benguela)' },
    OCEAN_THERMO_SCALE_M: { value: 70, min: 40, max: 120, source: 'the warm pool\'s thermocline ≈ 150–200 m deep: upwelling there barely cools the surface (Bjerknes; McPhaden & Picaut 1990)' },
    OCEAN_THERMO_EQ_M:  { value: 100, min: 70, max: 150, source: 'the equatorial thermocline (20 °C isotherm) ≈ 150–200 m deep in the west Pacific, ≈ 50 m in the east: a mean ≈ 100–120 m' },
    OCEAN_SHORE_KM:     { value: 600, min: 300, max: 1500, source: 'islands smaller than a few deformation radii (≈ 100–300 km) barely block the planetary waves that set the thermocline' },
    OCEAN_GPRIME:       { value: 0.03, min: 0.02, max: 0.05, source: 'reduced gravity of the tropical thermocline ≈ 0.02–0.04 m/s² (Δρ/ρ ≈ 0.002–0.004)' },
    OCEAN_EQ_DEG:       { value: 6, min: 3, max: 10, source: 'the equatorial Rossby radius ≈ 300 km ≈ 3°; the zonal tilt holds within ≈ 5–8° of the equator' },
    OCEAN_EKMAN_TAUY_DEG: { value: 5, min: 3, max: 8, source: 'Ekman balance fails within ≈ 3–5° of the equator; there a meridional stress drives a downwind, not a zonal, drift (Zebiak & Cane 1987; Philander & Pacanowski 1981)' },
    OCEAN_COAST_LAND_SHARE: { value: 0.35, min: 0.2, max: 0.5, source: 'coastal upwelling needs a coast long compared with the deformation radius (Allen 1980; island wakes and island upwelling are weak and local)' },
    OCEAN_COAST_KM:     { value: 300, min: 100, max: 400, source: 'coastal upwelling zones and their filaments reach ≈ 100–300 km offshore (California, Peru, Benguela)' },
    OCEAN_SEASON_SCALE: { value: 1, min: 0, max: 1, source: 'the wind-driven gyres\' seasonal cycle: large in the tropics (the Somali Current reverses with the monsoon; the equatorial countercurrent swells and ebbs), small in the subtropical gyres (Schott & McCreary 2001)' },
    OCEAN_SEASON_FULL_DEG: { value: 10, min: 5, max: 20, source: 'equatorial Kelvin and Rossby waves cross a basin in weeks to months: the tropical ocean follows the seasons' },
    OCEAN_SEASON_ZERO_DEG: { value: 60, min: 30, max: 70, source: 'midlatitude Rossby waves take years to cross a basin, so the gyres there hold their annual-mean state (developer: fade out by ≈ 60°)' },

    RAIN_EVAP_COEFF:    { value: 1.3e-3, min: 1.0e-3, max: 1.8e-3, source: 'bulk transfer coefficient C_E ≈ 1.1–1.5 × 10⁻³ (Large & Pond 1982; COARE)' },
    RAIN_SURFACE_RH:    { value: 0.8, min: 0.7, max: 0.85, source: 'near-surface relative humidity over the oceans ≈ 75–80 %' },
    RAIN_TERRAIN_HEIGHT_KM: { value: 4, min: 2.5, max: 5, source: 'precipitable water over the Tibetan Plateau (h ≈ 4.5–5 km) ≈ 20–25 % of the Indian lowlands’ in summer: e-folding ≈ 3–3.5 km averaged over the plateau, more where it is most heated (the elevated heated surface keeps a deep moist boundary layer)' },
    RAIN_TIMESCALE_H:   { value: 3, min: 1, max: 12, source: 'Bretherton et al. 2004: P = exp(15.6 (r − 0.603)) mm/day ⇒ a saturated tropical column rains out in ≈ 3 h' },
    RAIN_RH_STEEPNESS:  { value: 15.6, min: 8, max: 20, source: 'Bretherton et al. 2004 (15.6), from satellite column water and rain over the tropical oceans' },
    RAIN_EDDY_DIFF:     { value: 5e5, min: 1e5, max: 1.5e6, source: 'tropical transients (easterly waves, convection) mix far less than mid-latitude storms; no direct literature value' },
    RAIN_EDDY_LENGTH_KM: { value: 700, min: 400, max: 1200, source: 'mixing length ≈ the size of the storms (Rossby radius ≈ 1000 km); gives K ≈ 1–3 × 10⁶ m²/s in the storm belts (Frierson et al. 2007: 1.06 × 10⁶ m²/s for moist static energy)' },
    RAIN_TROPICAL_RH:   { value: 0.3, min: 0, max: 1, source: 'monsoon depressions and easterly waves form in the monsoon troughs\' cyclonic shear (≈ 1–3 × 10⁻⁵ s⁻¹) and bring ≈ 40–50 % of central and north India\'s monsoon rain (Hurley & Boos 2015); no direct value for the humidity spread; the derived winds are smooth, their cyclonic vorticity ≈ 5 × 10⁻⁶ s⁻¹, so the coefficient is larger than the shear alone would give' },
    RAIN_TROPICAL_KM:   { value: 600, min: 300, max: 1200, source: 'monsoon depressions and easterly waves ≈ 1000–2000 km across' },
    RAIN_STORM_RH:      { value: 0.2, min: 0.1, max: 0.35, source: 'sub-monthly spread of column relative humidity ≈ 0.1–0.2 in the storm belts, where the Eady growth rate is ≈ 0.6–0.8 per day; no direct literature value' },
    RAIN_WIND_ROT:      { value: 0.9, min: 0.6, max: 1.2, source: 'the moisture-weighted wind (≈ 900 hPa) is close to the wind above the friction layer' },
    RAIN_WIND_DIV_DRY:  { value: 0.3, min: 0.15, max: 0.5, source: 'shallow (≈ 1 km) convergence of heat lows and trade-wind divergence: ≈ 30–40 % of the column’s water (scale height ≈ 2.5 km)' },
    RAIN_WIND_DIV_MOIST: { value: 0.6, min: 0.4, max: 0.9, source: 'rain-belt inflow ≈ 1.5–3 km deep: moisture convergence ≈ 0.5–0.7 × W × surface convergence (P − E ≈ 5–10 mm/day)' },
    RAIN_STABILITY:     { value: 0.015, min: 0.0, max: 0.03, source: 'rain is suppressed under strong low inversions (cold upwelling, stratocumulus decks; Klein & Hartmann 1993: low cloud +6 %/K of stability); no direct literature value' },
    RAIN_TERRAIN_HEAT_K: { value: 6, min: 3, max: 10, source: 'a deep convective boundary layer (2–4 km) forms over strongly heated high ground (Tibet, pre-monsoon and monsoon); over cold or snowy high ground the boundary layer is shallow and stable' },
    RAIN_HIGH_K_PER_HPA: { value: 0.5, min: 0, max: 1.5, source: 'subsidence under the subtropical highs warms the air above the marine layer by several K (a trade-wind / stratocumulus inversion of 5–10 K under +5–10 hPa highs)' },
    RAIN_INSTABILITY:   { value: 0.015, min: 0, max: 0.03, source: 'convection over surfaces warmer than their surroundings (heated plateaus, warm currents such as the Gulf Stream and Kuroshio) raises rain for the same humidity; no direct literature value — kept to the scale of the stable-air term' },
    RAIN_STABLE_REF_KM: { value: 1500, min: 800, max: 3000, source: 'the free troposphere over a surface is set by its air mass over ≈ 1000–2000 km (the Rossby radius), not by the latitude circle: Siberian winter air is cold aloft too' },
    RAIN_FRONT_MM:      { value: 10, min: 0, max: 25, source: 'frontal cyclones bring 30–60 mm/month to mid-latitude continental interiors at 45–60° (eastern Europe, the Canadian prairies, the Russian plain) well beyond the reach of the mean flow; the polar-front band of Worldbuilding Pasta' },
    RAIN_FRONT_POS:     { value: 0.5, min: 0.4, max: 0.7, source: 'the polar-front jet and storm track ≈ 40°N in winter and 50–55°N in summer, about midway between the subtropical high and the subpolar low' },
    RAIN_FRONT_DEG:     { value: 10, min: 6, max: 14, source: 'the storm track ≈ 15–25° of latitude wide' },
    RAIN_FRONT_HIGH_HPA: { value: 4, min: 2, max: 8, source: 'fronts steer around blocking and subtropical highs (a few hPa above the zonal mean)' },
    RAIN_SOIL_MM:       { value: 150, min: 50, max: 300, source: 'plant-available soil water capacity ≈ 100–200 mm (e.g. Manabe 1969 bucket: 150 mm)' },
    RAIN_LAND_CONVECTION: { value: 0.08, min: 0, max: 0.12, source: 'daytime convection over wet land: rain over land peaks in the afternoon and picks up at ≈ 5–10 % lower column humidity than over the sea (Schiro et al. 2016; Bergemann & Jakob 2016); soil-moisture–precipitation coupling in monsoon regions (Koster et al. 2004)' },
    RAIN_COLUMN_LOCAL:  { value: 0.5, min: 0.2, max: 0.9, source: 'lower-tropospheric temperature anomalies over continents are ≈ 40–60 % of the surface anomaly' },
    RAIN_OROG_STORM:    { value: 1, min: 0.5, max: 1, source: 'orographic precipitation is concentrated in storms with strong cross-barrier flow (≈ 10–20 m/s), not the weak monthly-mean wind (Roe 2005)' },
    RAIN_LEE_PER_KM:    { value: 1, min: 0.3, max: 2, source: 'lee-side rain falls ≈ ×0.2–0.5 of windward within a few hundred km behind 1–2 km of relief (Cascades, Andes, Southern Alps; Roe 2005)' },
    RAIN_LEE_RECOVER_KM: { value: 400, min: 200, max: 800, source: 'rain shadows extend a few hundred km downwind of major ranges (Great Basin, Patagonia, Tarim; Roe 2005)' },
    RAIN_RISE_PER_KM:   { value: 0.5, min: 0, max: 1, source: 'windward precipitation grows ≈ 5–10 % per 100 m of elevation up to near the crest of mid-latitude ranges (Alps, Cascades, Sierra Nevada; Roe 2005)' },
    RAIN_ISLAND_BOOST:  { value: 1, min: 0, max: 2, source: 'tropical islands receive ≈ 1.5–3× the rain of the surrounding ocean (sea-breeze convergence and orography; e.g. the Maritime Continent, Hawaii, the Caribbean)' },
    RAIN_OROG_SPREAD_KM: { value: 600, min: 300, max: 1000, source: 'water wrung out on the windward side is missing downwind — the rain-shadow budget closes over a few hundred km' },
    RAIN_SLOPE_FACTOR:  { value: 1.0, min: 0.3, max: 1.5, source: 'orographic enhancement ≈ ×2–3 on windward slopes, ×0.3–0.6 in the lee at ≈ 0.1–0.2 m/s of forced ascent in storms (Roe 2005; Smith & Barstad 2004); moved within the spread distance, not made' },
    RAIN_OROGRAPHIC:    { value: 0.5, min: 0.1, max: 1.0, source: 'precipitation efficiency of orographic clouds ≈ 20–50 % (Jiang & Smith 2003)' },
});

export function setParams(p) { Object.assign(PARAMS, p); }
export function resetParams() { Object.assign(PARAMS, PARAMS_DEFAULTS); }
