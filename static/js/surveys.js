// Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
// Every id below was checked against the CDS MocServer on 2026-10-15 (all 55 present).

// The wavelength ladder: one all-sky view per band, from the highest-energy light to the lowest.
export const LADDER = [
  { id: 'CDS/P/Fermi/color', band: 'Gamma rays', short: 'γ', scope: 'Fermi LAT', what: '0.3–300 GeV · NASA Fermi, low-Earth orbit', color: '#c084fc' },
  { id: 'JAXA/P/SWIFT/BAT/Image', band: 'Hard X-rays', short: 'hX', scope: 'Swift BAT', what: '14–195 keV · NASA Swift, 70-month survey', color: '#a78bfa' },
  { id: 'CDS/P/RASS', band: 'X-rays', short: 'X', scope: 'ROSAT', what: '0.1–2.4 keV · ROSAT all-sky survey (MPE)', color: '#818cf8',
    deep: [{ below: 6, id: 'erosita/dr1/rate/rgb', scope: 'eROSITA DR1 (western galactic half)' }] },
  { id: 'CDS/P/GALEXGR6_7/color', band: 'Ultraviolet', short: 'UV', scope: 'GALEX', what: '135–280 nm · NASA GALEX (80% of the sky)', color: '#60a5fa' },
  { id: 'CDS/P/Mellinger/color', band: 'Visible light', short: 'Vis', scope: 'Mellinger mosaic', what: 'what your eyes would see from a dark site · © Axel Mellinger, viewed from CDS (not redistributed)', color: '#f1d48e',
    deep: [{ below: 20, id: 'CDS/P/DSS2/color', scope: 'DSS2 (Palomar + UK Schmidt)' }] },
  { id: 'CDS/P/Finkbeiner', band: 'Hydrogen-α', short: 'Hα', scope: 'WHAM / VTSS / SHASSA', what: '656 nm glowing hydrogen · Finkbeiner composite', color: '#fb7185' },
  { id: 'CDS/P/2MASS/color', band: 'Near-infrared', short: 'NIR', scope: '2MASS', what: '1.2–2.2 µm · two 1.3 m telescopes (Arizona + Chile)', color: '#fbbf24' },
  { id: 'CDS/P/allWISE/color', band: 'Mid-infrared', short: 'MIR', scope: 'WISE', what: '3.4–22 µm · NASA WISE / NEOWISE', color: '#f59e0b' },
  { id: 'ESAVO/P/AKARI/color', band: 'Far-infrared', short: 'FIR', scope: 'AKARI', what: '65–160 µm warm dust · JAXA AKARI', color: '#f97316' },
  { id: 'CDS/P/PLANCK/R2/HFI/color', band: 'Sub-millimetre', short: 'smm', scope: 'Planck HFI', what: '353–857 GHz cold dust · ESA Planck', color: '#ef4444' },
  { id: 'CDS/P/PLANCK/R3/CMB', band: 'Microwave (CMB)', short: 'CMB', scope: 'Planck', what: 'the Big Bang\'s afterglow, 13.8 billion years old · ESA Planck', color: '#dc2626' },
  { id: 'CDS/P/Haslam408', band: 'Radio', short: 'Radio', scope: 'Haslam 408 MHz', what: '73 cm · Jodrell Bank, Effelsberg, Parkes (synchrotron)', color: '#22d3ee',
    deep: [{ below: 12, id: 'CDS/P/NVSS', scope: 'NVSS 1.4 GHz (VLA)' }] },
];
export const LADDER_START = 4; // visible light

// Deeper surveys, grouped by band. sky = fraction of the sky covered.
export const LIBRARY = [
  { group: 'Gamma & X-ray', items: [
    { id: 'CDS/P/Fermi/color', name: 'Fermi LAT all-sky', by: 'NASA Fermi', sky: 1 },
    { id: 'ESAVO/P/INTEGRAL/color', name: 'INTEGRAL IBIS 20–100 keV', by: 'ESA INTEGRAL', sky: 0.94 },
    { id: 'JAXA/P/SWIFT/BAT/Image', name: 'Swift BAT hard X-ray', by: 'NASA Swift', sky: 1 },
    { id: 'erosita/dr1/rate/rgb', name: 'eROSITA DR1 colour', by: 'MPE / SRG (western galactic half)', sky: 0.51 },
    { id: 'CDS/P/RASS', name: 'ROSAT all-sky survey', by: 'MPE ROSAT', sky: 1 },
    { id: 'ESDC/P/XMM/EPIC-RGB', name: 'XMM-Newton EPIC colour', by: 'ESA XMM-Newton (pointings)', sky: 0.09 },
  ] },
  { group: 'Ultraviolet', items: [
    { id: 'CDS/P/GALEXGR6_7/color', name: 'GALEX GR6/7 colour', by: 'NASA GALEX', sky: 0.79 },
  ] },
  { group: 'Visible', items: [
    { id: 'CDS/P/Mellinger/color', name: 'Mellinger all-sky', by: 'Axel Mellinger', sky: 1 },
    { id: 'CDS/P/DSS2/color', name: 'Digitized Sky Survey 2', by: 'Palomar + UK Schmidt, STScI', sky: 1 },
    { id: 'ESAVO/P/GAIA/DR3-RGB', name: 'Gaia DR3 star-flux map', by: 'ESA Gaia — 1.8 billion stars', sky: 1 },
    { id: 'CDS/P/PanSTARRS/DR1/color-i-r-g', name: 'Pan-STARRS DR1', by: 'Haleakalā, Hawaiʻi', sky: 0.76 },
    { id: 'CDS/P/DESI-Legacy-Surveys/DR10/color', name: 'DESI Legacy Surveys DR10', by: 'Blanco + Mayall + Bok', sky: 0.67 },
    { id: 'CDS/P/Skymapper/DR4/color', name: 'SkyMapper DR4', by: 'Siding Spring, Australia', sky: 0.63 },
    { id: 'CDS/P/SDSS9/color', name: 'Sloan Digital Sky Survey 9', by: 'Apache Point, New Mexico', sky: 0.36 },
    { id: 'CDS/P/DES-DR2/ColorIRG', name: 'Dark Energy Survey DR2', by: 'Blanco 4 m, Cerro Tololo', sky: 0.13 },
    { id: 'CDS/P/SHASSA/H', name: 'SHASSA Hα', by: 'Southern H-alpha survey', sky: 1 },
  ] },
  { group: 'Infrared', items: [
    { id: 'CDS/P/2MASS/color', name: '2MASS J H K', by: 'UMass / IPAC', sky: 1 },
    { id: 'VOXASTRO/P/VHS/JKs/color', name: 'VISTA Hemisphere Survey', by: 'ESO VISTA 4.1 m', sky: 0.48 },
    { id: 'CDS/P/SPHEREx/QR2/color', name: 'SPHEREx QR2', by: 'NASA SPHEREx (launched 2025)', sky: 1 },
    { id: 'CDS/P/allWISE/color', name: 'AllWISE', by: 'NASA WISE', sky: 1 },
    { id: 'CDS/P/unWISE/color-W2-W1W2-W1', name: 'unWISE (deeper)', by: 'NASA WISE + NEOWISE', sky: 1 },
    { id: 'ESAVO/P/Spitzer/IRAC134-RGB-bright', name: 'Spitzer IRAC', by: 'NASA Spitzer (pointings)', sky: 0.04 },
    { id: 'ESAVO/P/AKARI/color', name: 'AKARI far-IR', by: 'JAXA AKARI', sky: 1 },
    { id: 'CDS/P/IRIS/color', name: 'IRAS (IRIS reprocessing)', by: 'NASA/NL/UK IRAS, 1983', sky: 1 },
    { id: 'ESAVO/P/Herschel/color', name: 'Herschel colour', by: 'ESA Herschel (pointings)', sky: 0.45 },
  ] },
  { group: 'Microwave', items: [
    { id: 'CDS/P/PLANCK/R2/HFI/color', name: 'Planck HFI dust', by: 'ESA Planck', sky: 1 },
    { id: 'CDS/P/ACT-PLANCK/DR4DR6/Color_MW', name: 'ACT + Planck Milky Way', by: 'Atacama Cosmology Telescope', sky: 1 },
    { id: 'CDS/P/PLANCK/R3/CMB', name: 'Cosmic microwave background', by: 'ESA Planck', sky: 1 },
    { id: 'CDS/P/PLANCK/R2/LFI/color', name: 'Planck LFI 30–70 GHz', by: 'ESA Planck', sky: 1 },
    { id: 'CDS/P/WMAP/W/9yr', name: 'WMAP W band', by: 'NASA WMAP', sky: 1 },
    { id: 'CDS/P/PlanckRevised/CO10', name: 'Carbon monoxide (CO 1-0)', by: 'Planck (molecular clouds)', sky: 1 },
  ] },
  { group: 'Radio', items: [
    { id: 'CDS/P/HI4PI/NHI', name: 'HI4PI neutral hydrogen', by: 'Effelsberg + Parkes', sky: 1 },
    { id: 'CDS/P/Haslam408', name: 'Haslam 408 MHz', by: 'Jodrell Bank, Effelsberg, Parkes', sky: 1 },
    { id: 'CDS/P/NVSS', name: 'NVSS 1.4 GHz', by: 'NRAO Very Large Array', sky: 0.82 },
    { id: 'NRAO/P/VLASS-Quicklook-MedianStack', name: 'VLASS 3 GHz', by: 'NRAO Very Large Array', sky: 0.82 },
    { id: 'CSIRO/P/RACS/mid/I', name: 'RACS-mid 1.4 GHz', by: 'CSIRO ASKAP, Western Australia', sky: 0.88 },
    { id: 'astron.nl/P/lotss_dr3_high', name: 'LoTSS DR3 144 MHz', by: 'ASTRON LOFAR, Europe', sky: 0.46 },
    { id: 'Leiden/P/TGSSADR', name: 'TGSS 150 MHz', by: 'GMRT, India', sky: 0.9 },
  ] },
];

// Showpieces: tiny, very deep images. Opening one flies there.
export const SHOWCASE = [
  { id: 'CDS/P/JWST/Carina-Nebula/NIRCam', name: 'Cosmic Cliffs, Carina Nebula', by: 'JWST NIRCam', ra: 159.21303, dec: -58.62017, fov: 0.12 },
  { id: 'CDS/P/JWST/Deep-Field-SMAC0723/NIRCam', name: "Webb's First Deep Field", by: 'JWST NIRCam', ra: 110.8278, dec: -73.4539, fov: 0.039 },
  { id: 'CDS/P/JWST/Stephans-Quintet/NIRCam-MIRI', name: "Stephan's Quintet", by: 'JWST NIRCam + MIRI', ra: 338.99754, dec: 33.96049, fov: 0.105 },
  { id: 'CDS/P/JWST/Southern-Ring-Nebula/NIRCam', name: 'Southern Ring Nebula', by: 'JWST NIRCam', ra: 151.75593, dec: -40.43597, fov: 0.04 },
  { id: 'CDS/P/JWST/Cartwheel/NIRCam-MIRI', name: 'Cartwheel Galaxy', by: 'JWST NIRCam + MIRI', ra: 9.42348, dec: -33.71324, fov: 0.039 },
  { id: 'CDS/P/HST/PHAT/color', name: 'Andromeda, star by star', by: 'Hubble PHAT', ra: 11.04479, dec: 41.53438, fov: 1.46 },
  { id: 'CDS/P/HST/GOODS/color', name: 'GOODS-South deep field', by: 'Hubble ACS', ra: 53.12394, dec: -27.73987, fov: 0.05 },
  { id: 'CDS/P/HST/EPO', name: 'Hubble outreach images', by: 'Hubble (start: Tarantula)', ra: 83.09729, dec: -67.70117, fov: 0.19 },
  { id: 'CDS/P/Euclid/NGC6505-Einstein-Ring', name: 'Einstein ring in NGC 6505', by: 'ESA Euclid', ra: 267.78109, dec: 65.53079, fov: 0.027 },
  { id: 'CDS/P/Euclid/ERO/color', name: 'Euclid early release', by: 'ESA Euclid (start: Horsehead)', ra: 86.69083, dec: 0.07917, fov: 1.2 },
  { id: 'CDS/P/Euclid/Q1/color', name: 'Euclid Q1 deep field', by: 'ESA Euclid', ra: 269.73292, dec: 66.01769, fov: 10 },
  { id: 'CDS/P/Rubin/FirstLook', name: 'Rubin First Look: Trifid & Lagoon', by: 'Vera C. Rubin Observatory', ra: 271.60228, dec: -23.87823, fov: 6 },
  { id: 'CDS/P/MeerKAT/Galactic-Centre-1284MHz-StokesI', name: 'Heart of the Milky Way in radio', by: 'MeerKAT, South Africa', ra: 266.37099, dec: -29.22199, fov: 3.2 },
];

// Thumbnails for the "in every light" strip of a point report (hips2fits renders a cut-out of each).
export const STRIP = [
  { id: 'CDS/P/Fermi/color', label: 'Gamma' },
  { id: 'CDS/P/RASS', label: 'X-ray' },
  { id: 'CDS/P/GALEXGR6_7/color', label: 'UV' },
  { id: 'CDS/P/DSS2/color', label: 'Visible' },
  { id: 'CDS/P/2MASS/color', label: 'Near-IR' },
  { id: 'CDS/P/allWISE/color', label: 'Mid-IR' },
  { id: 'CDS/P/IRIS/color', label: 'Far-IR' },
  { id: 'CDS/P/PLANCK/R2/HFI/color', label: 'Sub-mm' },
  { id: 'CDS/P/NVSS', label: 'Radio' },
];

export function surveyName(id) {
  for (const l of LADDER) if (l.id === id) return `${l.band} · ${l.scope}`;
  for (const g of LIBRARY) for (const i of g.items) if (i.id === id) return i.name;
  for (const s of SHOWCASE) if (s.id === id) return s.name;
  return id;
}

// the survey to show for a ladder band at a given field of view: coarse all-sky maps hand over to sharper ones when zoomed in
export function ladderAt(entry, fov) {
  let best = { id: entry.id, scope: entry.scope };
  for (const d of entry.deep || []) if (fov < d.below) best = { id: d.id, scope: d.scope };
  return best;
}
