# Asset sources

- The current map uses geographic US Atlas and World Atlas sources from `scripts/sources`, transformed into versioned GeoJSON under `public/data/releases`. These preserve real latitude/longitude, rather than the previous Albers-projected drawing. Projects: https://github.com/topojson/us-atlas and https://github.com/topojson/world-atlas (ISC licenses; underlying US Census and Natural Earth geography).
- Portraits: https://github.com/unitedstates/images, `congress/225x275` (C001098, C001056, C001091, G000587). Official congressional portraits; public domain as described in the source project's README.

Assets are served locally. Profile copy, statistics, votes, bills, and contact information are illustrative, not verified civic data.

Inter and Barlow Condensed are bundled from Fontsource, under the included SIL Open Font License notices. No external font or map-tile request is required.
