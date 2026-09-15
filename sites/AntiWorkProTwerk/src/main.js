import "./style.css";

const asset = (name) => `${import.meta.env.BASE_URL}assets/${name}`;
const people = [
  {
    id: "cruz",
    name: "Ted Cruz",
    party: "R",
    role: "U.S. Senator (TX)",
    description:
      "Focuses on border security, energy independence, and conservative values.",
    approval: 52,
    alignment: 78,
    donations: "$2.4M",
    bills: 42,
    city: "statewide",
    issues: ["Border security", "Energy", "Small business"],
  },
  {
    id: "cornyn",
    name: "John Cornyn",
    party: "R",
    role: "U.S. Senator (TX)",
    description:
      "Focuses on national security, judicial appointments, and economic growth.",
    approval: 49,
    alignment: 82,
    donations: "$1.1M",
    bills: 28,
    city: "statewide",
    issues: ["National security", "Infrastructure", "Economic growth"],
  },
  {
    id: "castro",
    name: "Joaquin Castro",
    party: "D",
    role: "U.S. Representative (TX-20)",
    description:
      "Focuses on voting rights, healthcare access, and economic opportunity.",
    approval: 61,
    alignment: 88,
    donations: "$1.8M",
    bills: 24,
    city: "San Antonio",
    issues: ["Voting rights", "Healthcare", "Education"],
  },
  {
    id: "garcia",
    name: "Sylvia Garcia",
    party: "D",
    role: "U.S. Representative (TX-29)",
    description:
      "Focuses on healthcare, immigration reform, and working families.",
    approval: 56,
    alignment: 74,
    donations: "$920K",
    bills: 16,
    city: "Houston",
    issues: ["Healthcare", "Immigration", "Working families"],
  },
];
const symbols = {
  phone:
    '<path d="m7 3 4 6-3 3c2 4 4 6 8 8l3-3 6 4c-1 6-5 7-10 4C8 21 3 16 2 10 1 6 3 3 7 3Z" fill="currentColor" stroke="none"/>',
  chart:
    '<path d="M4 16h5v12H4zm9-12h5v24h-5zm9 6h5v18h-5z" fill="currentColor" stroke="none"/>',
  search: '<circle cx="13" cy="13" r="9"/><path d="m20 20 9 9"/>',
  people:
    '<g fill="currentColor" stroke="none"><circle cx="16" cy="10" r="5"/><circle cx="5" cy="13" r="3.5"/><circle cx="27" cy="13" r="3.5"/><path d="M8 28v-5a8 8 0 0 1 16 0v5ZM0 27v-5a5 5 0 0 1 7-4v9ZM32 27v-5a5 5 0 0 0-7-4v9Z"/></g>',
  document:
    '<path d="M6 2h13l7 7v21H6Z" fill="currentColor" stroke="none"/><path d="M19 2v8h7M10 15h12M10 20h12M10 25h8" stroke="#ff0525" stroke-width="2"/>',
};
const actions = [
  ["call", "phone", "Call representative", "Connect directly", "red"],
  ["votes", "chart", "Track votes", "Follow the record", "blue"],
  ["donors", "search", "Review donor activity", "See who funds them", "yellow"],
  [
    "compare",
    "people",
    "Compare issue positions",
    "Align your values",
    "black",
  ],
  ["bills", "document", "See related bills", "Explore connections", "red"],
];
document.querySelector("#app").innerHTML = `
  <header class="masthead"><div><a class="brand" href="${import.meta.env.BASE_URL}"><span></span>Civic Intelligence</a><nav aria-label="Primary"><a href="#politicians">People</a><i>/</i><button data-action="bills">Bills</button><i>/</i><button data-action="impact">Impact</button></nav></div><p class="masthead-note">Data drives<br>a more open<br>democracy<span></span></p></header>
  <main class="dashboard">
    <section class="actions-panel" aria-labelledby="actions-heading"><div class="section-tick"></div><p class="eyebrow selected-state"><span></span>Selected state <span class="mobile-state">/ Texas</span></p><h1 id="actions-heading">Actions</h1><p class="tagline">Be informed. Make an impact.</p><div class="section-tick heading-tick"></div>
      <div class="action-list">${actions.map(([id, symbol, title, subtitle, color]) => `<button class="action" data-action="${id}"><span class="action-icon ${color}"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${symbols[symbol]}</svg></span><span class="action-text"><strong>${title}</strong><span>${subtitle}</span></span><span class="chevron" aria-hidden="true">›</span></button>`).join("")}</div>
      <div class="actions-foot"><div class="section-tick"></div><p>Civic data<br>for a stronger<br>tomorrow</p><div class="section-tick"></div></div>
    </section>
    <section class="map-stage" aria-label="Map of Texas. Select a city to explore its sample delegation."><div id="map" class="map-canvas"></div><div class="map-selection" aria-live="polite"><span id="location-label">Exploring Texas</span><button id="reset-map" hidden>Show all Texas ×</button></div><div class="map-scale" aria-hidden="true"><div><span>0</span><span>100</span><span>250</span><span>500 mi</span></div><i></i></div></section>
    <section class="politicians-panel" id="politicians" aria-labelledby="politicians-heading"><div class="section-bars"><span></span><span></span></div><h2 id="politicians-heading">Politicians</h2><p class="tagline" id="delegation-label">Texas delegation / U.S. Congress</p><div class="politician-list" id="politician-list"></div><p class="data-note"><span></span>Demo experience · Illustrative data</p><p class="panel-signoff">People <b>›</b> Policy <b>›</b> Progress <span></span></p></section>
  </main>
  <dialog id="detail-dialog" aria-labelledby="dialog-title"><div class="dialog-top"><span class="eyebrow">Civic Intelligence / Texas</span><button class="close-dialog" aria-label="Close details">×</button></div><div id="dialog-content"></div><p class="dialog-disclaimer">Demo only. Profiles, figures, votes, contact details, and bills are illustrative and are not verified civic records.</p></dialog>`;

function renderPeople(city = null) {
  document.querySelector("#politician-list").innerHTML = people
    .filter((p) => !city || p.city === "statewide" || p.city === city)
    .map(
      (p) =>
        `<button class="politician-card" data-person="${p.id}" aria-label="View ${p.name}, ${p.party === "R" ? "Republican" : "Democrat"}, sample profile"><div class="profile"><img src="${asset(`${p.id}.jpg`)}" alt="" width="106" height="106"><div class="profile-copy"><h3>${p.name} <span class="party ${p.party}" aria-hidden="true">${p.party}</span></h3><p class="role">${p.role}</p><p class="description">${p.description}</p></div><span class="chevron" aria-hidden="true">›</span></div><dl class="metrics"><div><dt>Approval</dt><dd>${p.approval}%</dd></div><div><dt>Vote alignment</dt><dd>${p.alignment}%</dd></div><div><dt>Donations</dt><dd>${p.donations}</dd></div><div><dt>Bills</dt><dd>${p.bills}</dd></div></dl></button>`,
    )
    .join("");
  document.querySelector("#delegation-label").textContent = city
    ? `${city} / Sample delegation`
    : "Texas delegation / U.S. Congress";
}
renderPeople();

// Decode locally hosted Albers-projected US Atlas topology into SVG boundaries.
async function renderMap() {
  try {
    const response = await fetch(asset("us-states.json"));
    if (!response.ok) throw new Error("Map unavailable");
    const topology = await response.json();
    const arcs = topology.arcs.map((arc) => {
      let x = 0,
        y = 0;
      return arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [
          x * topology.transform.scale[0] + topology.transform.translate[0],
          y * topology.transform.scale[1] + topology.transform.translate[1],
        ];
      });
    });
    const ringPath = (ring) =>
      `M${ring
        .flatMap((i) => (i < 0 ? [...arcs[~i]].reverse() : arcs[i]))
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join("L")}Z`;
    const statePath = (s) =>
      (s.type === "Polygon" ? s.arcs : s.arcs.flat()).map(ringPath).join("");
    const states = topology.objects.states.geometries;
    const texas = statePath(states.find((s) => s.id === "48"));
    const labels = [
      ["CA", 148, 325],
      ["AZ", 200, 390],
      ["NM", 307, 397],
      ["CO", 327, 290],
      ["KS", 450, 310],
      ["OK", 461, 376],
      ["AR", 570, 401],
      ["LA", 579, 480],
      ["MO", 564, 302],
      ["IL", 620, 265],
    ];
    const cities = [
      ["Dallas", 477, 437],
      ["Austin", 450, 491],
      ["San Antonio", 424, 515],
      ["Houston", 505, 507],
    ];
    document.querySelector("#map").innerHTML =
      `<svg class="texas-map" viewBox="220 260 420 410" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Texas and surrounding states">
      <defs><pattern id="map-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".32" fill="#6aa9df" opacity=".45"/></pattern><pattern id="texas-dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".28" fill="#fff" opacity=".42"/></pattern><linearGradient id="texas-red" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#ff3348"/><stop offset=".5" stop-color="#ff203b"/><stop offset="1" stop-color="#e40027"/></linearGradient><filter id="texas-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="1" flood-color="#123856" flood-opacity=".6"/><feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#ff2343" flood-opacity=".23"/></filter><clipPath id="texas-clip"><path d="${texas}"/></clipPath></defs>
      <rect x="80" y="100" width="700" height="650" fill="#f4faff"/><path d="M150 422 265 461 295 480 343 562 389 586 426 622 446 710H170Z" fill="#e2eff8" stroke="white" stroke-width=".7"/>
      <g class="states">${states
        .filter((s) => !["02", "15", "48"].includes(s.id))
        .map((s) => `<path d="${statePath(s)}"/>`)
        .join(
          "",
        )}</g><rect x="80" y="100" width="700" height="650" fill="url(#map-dots)"/>
      <g class="map-state-labels">${labels.map(([label, x, y]) => `<text x="${x}" y="${y}">${label}</text>`).join("")}</g><g class="map-grid"><path d="M290 260V670M405 260V670M520 260V670M220 380H650M220 490H650M220 610H650"/></g><text class="country-label" x="380" y="326">UNITED STATES</text><text class="country-label muted" x="345" y="617">MEXICO</text><text class="ocean-label" x="545" y="590"><tspan>GULF OF</tspan><tspan x="545" dy="9">MEXICO</tspan></text>
      <path d="${texas}" fill="url(#texas-red)" stroke="white" stroke-width="1.4" stroke-linejoin="round" filter="url(#texas-shadow)"/><g clip-path="url(#texas-clip)" aria-hidden="true"><rect x="280" y="340" width="280" height="280" fill="url(#texas-dots)"/><g class="texas-roads"><path d="M390 354 394 414 424 454 450 491 424 515 460 579M299 452 361 466 424 454 477 437 506 455 505 507 450 491M361 466 390 497 424 515M394 414 445 414 477 437M477 437 469 470 505 507 535 525M424 454 432 479 450 491M361 466 385 536 414 552"/></g></g><text class="texas-label" x="439" y="472" text-anchor="middle">TEXAS</text>
      <g class="coordinates" aria-hidden="true"><path d="m489 400 19-28h5"/><text x="516" y="372">32.7767° N<tspan x="516" dy="6">96.7970° W</tspan></text><path class="red-line" d="m405 526-19 27h-5"/><text class="red-text" x="348" y="554">29.4241° N<tspan x="348" dy="6">98.4936° W</tspan></text></g><g class="map-crosses" aria-hidden="true"><path d="M345 276h8m-4-4v8M605 598h8m-4-4v8M560 354h8m-4-4v8M278 570h8m-4-4v8M342 423h7m-3.5-3.5v7"/></g>
      ${cities.map(([name, x, y]) => `<g class="map-city" role="button" tabindex="0" aria-label="Explore ${name} sample delegation" aria-pressed="false" data-city="${name}" transform="translate(${x} ${y})"><circle class="city-hit" r="12"/><circle class="city-marker" r="${name === "Austin" ? 5.5 : 3.6}"/>${name === "Austin" ? '<path class="capital-star" d="m0-3 .9 2 2.2.2-1.6 1.5.5 2.2-2-1.1-2 1.1.5-2.2L-3-.8l2.2-.2Z"/>' : ""}<text x="8" y="2.5">${name}</text></g>`).join("")}</svg>`;
  } catch {
    document.querySelector("#map").innerHTML =
      '<div class="map-error"><strong>Explore Texas</strong><p>The map could not load. Sample profiles and actions are still available.</p><button class="primary-button" id="retry-map">Retry map</button></div>';
  }
}
renderMap();

const dialog = document.querySelector("#detail-dialog");
const content = document.querySelector("#dialog-content");
const selector = `<label class="field-label" for="person-select">Representative</label><select id="person-select">${people.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select>`;
const bills = [
  [
    "H.R. 1042",
    "Community Health Access Act",
    "Expands community clinics and preventive care in underserved areas.",
    "In committee",
  ],
  [
    "S. 208",
    "Texas Infrastructure Investment Act",
    "Supports local roads, water systems, and broadband connections.",
    "Introduced",
  ],
  [
    "H.R. 315",
    "Open Government Data Act",
    "Makes public spending records easier to access and understand.",
    "Passed House",
  ],
];
const tags = (p) =>
  `<div class="issue-tags">${p.issues.map((issue) => `<span>${issue}</span>`).join("")}</div>`;
function openDetails(action, personId) {
  const person = people.find((p) => p.id === personId);
  const views = {
    call: [
      "Make your voice heard.",
      `<p>Choose a representative and prepare for a conversation with their office.</p>${selector}<div id="person-detail"></div><h3>A simple starting point</h3><blockquote>“Hi, I’m a constituent from Texas. I’m calling about an issue that matters to my community. Could you share the representative’s position?”</blockquote>`,
    ],
    votes: [
      "Follow the record.",
      `<p>Explore sample votes. Select a representative to compare their record.</p>${selector}<div id="person-detail"></div>`,
    ],
    donors: [
      "Follow the funding.",
      `<p>A sample breakdown of campaign contributions by source.</p>${selector}<div id="person-detail"></div>`,
    ],
    compare: [
      "Find your common ground.",
      `<p>Compare the sample priorities assigned to each profile.</p><div class="comparison-list">${people.map((p) => `<div><h3>${p.name} <span class="party ${p.party}">${p.party}</span></h3>${tags(p)}</div>`).join("")}</div>`,
    ],
    bills: [
      "See policy in motion.",
      `<p>Three fictional bills show how legislation could be explored here.</p><div class="bill-list">${bills.map(([id, title, description, status]) => `<article><div class="bill-meta"><span>${id} · Sample bill</span><span>${status}</span></div><h3>${title}</h3><p>${description}</p></article>`).join("")}</div>`,
    ],
    impact: [
      "Information into action.",
      "<p>A clearer view of the people and policies shaping your community.</p><h3>01 / Know your representatives</h3><p>Explore the Texas sample delegation and its priorities.</p><h3>02 / Connect the dots</h3><p>Compare votes, campaign funding, and proposed legislation.</p><h3>03 / Make yourself heard</h3><p>Use the call guide to start a conversation about an issue you care about.</p>",
    ],
  };
  if (action === "profile" && person) {
    content.innerHTML = `<div class="detail-profile"><img src="${asset(`${person.id}.jpg`)}" alt="Portrait of ${person.name}"><div><p class="eyebrow">Sample profile / ${person.party === "R" ? "Republican" : "Democrat"}</p><h2 id="dialog-title">${person.name}</h2><p>${person.role}</p></div></div><p>${person.description}</p>${tags(person)}<dl class="detail-metrics"><div><dt>Sample approval</dt><dd>${person.approval}%</dd></div><div><dt>Sample donations</dt><dd>${person.donations}</dd></div><div><dt>Sample bills</dt><dd>${person.bills}</dd></div></dl><button class="primary-button" data-profile-votes="${person.id}">Explore sample votes ↗</button>`;
  } else {
    const [title, body] = views[action];
    content.innerHTML = `<h2 id="dialog-title">${title}</h2>${body}`;
    const select = document.querySelector("#person-select");
    if (select) {
      if (personId) select.value = personId;
      select.addEventListener("change", () =>
        renderPersonDetail(action, select.value),
      );
      renderPersonDetail(action, select.value);
    }
  }
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("dialog-open");
}
function renderPersonDetail(action, id) {
  const p = people.find((person) => person.id === id),
    index = people.indexOf(p);
  const details = {
    call: `<div class="contact-card"><span class="eyebrow">Sample office contact</span><h3>${p.name}</h3><p>Washington, D.C. office</p><strong>(202) 555-01${index + 10}</strong><small>Placeholder number — calling is disabled in this demo.</small></div>`,
    votes: `<div class="vote-list">${bills.map(([bill, title], i) => `<div><span><small>${bill} · Sample vote</small><strong>${title}</strong></span><b class="vote ${(index + i) % 3 === 0 ? "nay" : ""}">${(index + i) % 3 === 0 ? "Nay" : "Yea"}</b></div>`).join("")}</div><p class="record-note">${p.alignment}% sample vote alignment · ${p.bills} sample bills</p>`,
    donors: `<div class="donor-total"><span>Sample contributions</span><strong>${p.donations}</strong></div>${[
      ["Individual donors", 48 + index * 3],
      ["Political action committees", 37 - index * 2],
      ["Other contributions", 15 - index],
    ]
      .map(
        ([label, value]) =>
          `<div class="donor-row"><div><span>${label}</span><strong>${value}%</strong></div><meter min="0" max="100" value="${value}" aria-label="${label}">${value}%</meter></div>`,
      )
      .join("")}`,
  };
  document.querySelector("#person-detail").innerHTML = details[action];
}
function selectCity(city) {
  renderPeople(city);
  document.querySelector("#location-label").textContent = city
    ? `Exploring ${city}`
    : "Exploring Texas";
  document.querySelector("#reset-map").hidden = !city;
  document
    .querySelectorAll("[data-city]")
    .forEach((node) =>
      node.setAttribute("aria-pressed", String(node.dataset.city === city)),
    );
}
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]"),
    person = event.target.closest("[data-person]"),
    city = event.target.closest("[data-city]"),
    votes = event.target.closest("[data-profile-votes]");
  if (action) openDetails(action.dataset.action);
  if (person) openDetails("profile", person.dataset.person);
  if (city) selectCity(city.dataset.city);
  if (votes) {
    openDetails("votes", votes.dataset.profileVotes);
    document.querySelector("#person-select").focus();
  }
  if (event.target.closest("#retry-map")) renderMap();
});
document.querySelector("#map").addEventListener("keydown", (event) => {
  const city = event.target.closest("[data-city]");
  if (city && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    selectCity(city.dataset.city);
  }
});
document
  .querySelector("#reset-map")
  .addEventListener("click", () => selectCity(null));
document
  .querySelector(".close-dialog")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  const b = dialog.getBoundingClientRect();
  if (
    event.target === dialog &&
    (event.clientX < b.left ||
      event.clientX > b.right ||
      event.clientY < b.top ||
      event.clientY > b.bottom)
  )
    dialog.close();
});
dialog.addEventListener("close", () =>
  document.body.classList.remove("dialog-open"),
);
