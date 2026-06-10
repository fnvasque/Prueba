/* stars.js — Catálogo de estrellas brillantes (J2000) y líneas de constelaciones.
 * ra en horas, dec en grados, mag = magnitud aparente.
 * Las líneas referencian índices dentro de STARS.
 */
'use strict';

const STARS = [
  // --- Orión ---
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 5.9195, dec: 7.407, mag: 0.42 },
  { id: 'rigel', name: 'Rigel', ra: 5.2423, dec: -8.2016, mag: 0.13 },
  { id: 'bellatrix', name: 'Bellatrix', ra: 5.4189, dec: 6.3497, mag: 1.64 },
  { id: 'mintaka', name: 'Mintaka', ra: 5.5334, dec: -0.2991, mag: 2.23 },
  { id: 'alnilam', name: 'Alnilam', ra: 5.6036, dec: -1.2019, mag: 1.69 },
  { id: 'alnitak', name: 'Alnitak', ra: 5.6793, dec: -1.9426, mag: 1.77 },
  { id: 'saiph', name: 'Saiph', ra: 5.7959, dec: -9.6696, mag: 2.09 },
  { id: 'meissa', name: 'Meissa', ra: 5.5856, dec: 9.9342, mag: 3.39 },
  // --- Osa Mayor ---
  { id: 'dubhe', name: 'Dubhe', ra: 11.0621, dec: 61.7510, mag: 1.79 },
  { id: 'merak', name: 'Merak', ra: 11.0307, dec: 56.3824, mag: 2.37 },
  { id: 'phecda', name: 'Phecda', ra: 11.8972, dec: 53.6948, mag: 2.44 },
  { id: 'megrez', name: 'Megrez', ra: 12.2571, dec: 57.0326, mag: 3.31 },
  { id: 'alioth', name: 'Alioth', ra: 12.9005, dec: 55.9598, mag: 1.77 },
  { id: 'mizar', name: 'Mizar', ra: 13.3988, dec: 54.9254, mag: 2.27 },
  { id: 'alkaid', name: 'Alkaid', ra: 13.7923, dec: 49.3133, mag: 1.86 },
  // --- Osa Menor ---
  { id: 'polaris', name: 'Polaris (Estrella Polar)', ra: 2.5303, dec: 89.2641, mag: 1.98 },
  { id: 'kochab', name: 'Kochab', ra: 14.8451, dec: 74.1555, mag: 2.08 },
  { id: 'pherkad', name: 'Pherkad', ra: 15.3455, dec: 71.8340, mag: 3.00 },
  // --- Casiopea ---
  { id: 'caph', name: 'Caph', ra: 0.1530, dec: 59.1498, mag: 2.27 },
  { id: 'schedar', name: 'Schedar', ra: 0.6751, dec: 56.5373, mag: 2.23 },
  { id: 'gammacas', name: 'Tsih (γ Cas)', ra: 0.9451, dec: 60.7167, mag: 2.47 },
  { id: 'ruchbah', name: 'Ruchbah', ra: 1.4302, dec: 60.2354, mag: 2.68 },
  { id: 'segin', name: 'Segin', ra: 1.9066, dec: 63.6701, mag: 3.38 },
  // --- Escorpio ---
  { id: 'antares', name: 'Antares', ra: 16.4901, dec: -26.4320, mag: 0.96 },
  { id: 'dschubba', name: 'Dschubba', ra: 16.0056, dec: -22.6217, mag: 2.32 },
  { id: 'acrab', name: 'Acrab', ra: 16.0906, dec: -19.8054, mag: 2.62 },
  { id: 'epssco', name: 'Larawag (ε Sco)', ra: 16.8361, dec: -34.2932, mag: 2.29 },
  { id: 'shaula', name: 'Shaula', ra: 17.5601, dec: -37.1038, mag: 1.63 },
  { id: 'sargas', name: 'Sargas', ra: 17.6220, dec: -42.9978, mag: 1.87 },
  // --- Cruz del Sur ---
  { id: 'acrux', name: 'Acrux', ra: 12.4433, dec: -63.0991, mag: 0.76 },
  { id: 'mimosa', name: 'Mimosa', ra: 12.7953, dec: -59.6888, mag: 1.25 },
  { id: 'gacrux', name: 'Gacrux', ra: 12.5194, dec: -57.1132, mag: 1.64 },
  { id: 'deltacru', name: 'Imai (δ Cru)', ra: 12.2524, dec: -58.7489, mag: 2.80 },
  // --- Centauro ---
  { id: 'alphacen', name: 'Alfa Centauri', ra: 14.6599, dec: -60.8354, mag: -0.27 },
  { id: 'hadar', name: 'Hadar', ra: 14.0637, dec: -60.3730, mag: 0.61 },
  // --- Cisne ---
  { id: 'deneb', name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.25 },
  { id: 'sadr', name: 'Sadr', ra: 20.3705, dec: 40.2567, mag: 2.23 },
  { id: 'gienah', name: 'Aljanah (ε Cyg)', ra: 20.7702, dec: 33.9703, mag: 2.48 },
  { id: 'deltacyg', name: 'Fawaris (δ Cyg)', ra: 19.7496, dec: 45.1308, mag: 2.87 },
  { id: 'albireo', name: 'Albireo', ra: 19.5120, dec: 27.9597, mag: 3.18 },
  // --- Lira / Águila ---
  { id: 'vega', name: 'Vega', ra: 18.6156, dec: 38.7837, mag: 0.03 },
  { id: 'altair', name: 'Altair', ra: 19.8464, dec: 8.8683, mag: 0.77 },
  // --- Tauro ---
  { id: 'aldebaran', name: 'Aldebarán', ra: 4.5987, dec: 16.5093, mag: 0.85 },
  { id: 'elnath', name: 'Elnath', ra: 5.4382, dec: 28.6075, mag: 1.68 },
  { id: 'alcyone', name: 'Alcíone (Pléyades)', ra: 3.7914, dec: 24.1051, mag: 2.87 },
  // --- Géminis ---
  { id: 'pollux', name: 'Pólux', ra: 7.7553, dec: 28.0262, mag: 1.14 },
  { id: 'castor', name: 'Cástor', ra: 7.5767, dec: 31.8883, mag: 1.58 },
  { id: 'alhena', name: 'Alhena', ra: 6.6285, dec: 16.3993, mag: 1.92 },
  // --- Can Mayor / Menor ---
  { id: 'sirius', name: 'Sirio', ra: 6.7525, dec: -16.7161, mag: -1.46 },
  { id: 'mirzam', name: 'Mirzam', ra: 6.3783, dec: -17.9559, mag: 1.98 },
  { id: 'adhara', name: 'Adhara', ra: 6.9771, dec: -28.9721, mag: 1.50 },
  { id: 'wezen', name: 'Wezen', ra: 7.1399, dec: -26.3932, mag: 1.84 },
  { id: 'procyon', name: 'Proción', ra: 7.6550, dec: 5.2250, mag: 0.34 },
  // --- Auriga / Boyero / Virgo ---
  { id: 'capella', name: 'Capella', ra: 5.2782, dec: 45.9980, mag: 0.08 },
  { id: 'arcturus', name: 'Arturo', ra: 14.2610, dec: 19.1825, mag: -0.05 },
  { id: 'spica', name: 'Espiga (Spica)', ra: 13.4199, dec: -11.1613, mag: 0.97 },
  // --- Leo ---
  { id: 'regulus', name: 'Régulo', ra: 10.1395, dec: 11.9672, mag: 1.35 },
  { id: 'denebola', name: 'Denébola', ra: 11.8177, dec: 14.5720, mag: 2.14 },
  { id: 'algieba', name: 'Algieba', ra: 10.3329, dec: 19.8415, mag: 2.08 },
  { id: 'zosma', name: 'Zosma', ra: 11.2351, dec: 20.5237, mag: 2.56 },
  // --- Pegaso / Andrómeda / Perseo ---
  { id: 'markab', name: 'Markab', ra: 23.0793, dec: 15.2052, mag: 2.48 },
  { id: 'scheat', name: 'Scheat', ra: 23.0629, dec: 28.0828, mag: 2.42 },
  { id: 'algenib', name: 'Algenib', ra: 0.2206, dec: 15.1836, mag: 2.83 },
  { id: 'alpheratz', name: 'Alpheratz', ra: 0.1398, dec: 29.0904, mag: 2.06 },
  { id: 'mirach', name: 'Mirach', ra: 1.1622, dec: 35.6206, mag: 2.05 },
  { id: 'almach', name: 'Almach', ra: 2.0650, dec: 42.3297, mag: 2.26 },
  { id: 'mirfak', name: 'Mirfak', ra: 3.4054, dec: 49.8612, mag: 1.79 },
  { id: 'algol', name: 'Algol', ra: 3.1361, dec: 40.9556, mag: 2.12 },
  // --- Sagitario (tetera) ---
  { id: 'kausaustralis', name: 'Kaus Australis', ra: 18.4029, dec: -34.3846, mag: 1.85 },
  { id: 'kausmedia', name: 'Kaus Media', ra: 18.3499, dec: -29.8281, mag: 2.70 },
  { id: 'nunki', name: 'Nunki', ra: 18.9211, dec: -26.2967, mag: 2.05 },
  { id: 'ascella', name: 'Ascella', ra: 19.0435, dec: -29.8801, mag: 2.60 },
  // --- Sur profundo / otras brillantes ---
  { id: 'canopus', name: 'Canopus', ra: 6.3992, dec: -52.6957, mag: -0.74 },
  { id: 'achernar', name: 'Achernar', ra: 1.6286, dec: -57.2367, mag: 0.46 },
  { id: 'fomalhaut', name: 'Fomalhaut', ra: 22.9608, dec: -29.6222, mag: 1.16 },
  { id: 'alnair', name: 'Alnair', ra: 22.1372, dec: -46.9610, mag: 1.74 },
  { id: 'peacock', name: 'Peacock', ra: 20.4275, dec: -56.7351, mag: 1.94 },
  { id: 'atria', name: 'Atria', ra: 16.8111, dec: -69.0277, mag: 1.91 },
  { id: 'alphard', name: 'Alphard', ra: 9.4598, dec: -8.6586, mag: 1.98 },
  { id: 'alphecca', name: 'Alphecca', ra: 15.5781, dec: 26.7147, mag: 2.23 },
  { id: 'eltanin', name: 'Eltanin', ra: 17.9434, dec: 51.4889, mag: 2.23 },
  { id: 'rasalhague', name: 'Rasalhague', ra: 17.5822, dec: 12.5600, mag: 2.08 }
];

// Índice rápido por id
const STAR_INDEX = Object.fromEntries(STARS.map((s, i) => [s.id, i]));

// Líneas de constelaciones: pares de ids de estrellas
const CONSTELLATIONS = [
  { name: 'Orión', lines: [
    ['betelgeuse', 'meissa'], ['meissa', 'bellatrix'],
    ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'],
    ['alnitak', 'alnilam'], ['alnilam', 'mintaka'],
    ['alnitak', 'saiph'], ['mintaka', 'rigel'], ['saiph', 'rigel']
  ]},
  { name: 'Osa Mayor', lines: [
    ['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'dubhe'],
    ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid']
  ]},
  { name: 'Osa Menor', lines: [
    ['polaris', 'kochab'], ['kochab', 'pherkad']
  ]},
  { name: 'Casiopea', lines: [
    ['caph', 'schedar'], ['schedar', 'gammacas'], ['gammacas', 'ruchbah'], ['ruchbah', 'segin']
  ]},
  { name: 'Escorpio', lines: [
    ['acrab', 'dschubba'], ['dschubba', 'antares'], ['antares', 'epssco'],
    ['epssco', 'shaula'], ['shaula', 'sargas']
  ]},
  { name: 'Cruz del Sur', lines: [
    ['acrux', 'gacrux'], ['mimosa', 'deltacru']
  ]},
  { name: 'Centauro', lines: [
    ['alphacen', 'hadar']
  ]},
  { name: 'Cisne', lines: [
    ['deneb', 'sadr'], ['sadr', 'albireo'], ['deltacyg', 'sadr'], ['sadr', 'gienah']
  ]},
  { name: 'Tauro', lines: [
    ['aldebaran', 'elnath'], ['aldebaran', 'alcyone']
  ]},
  { name: 'Géminis', lines: [
    ['castor', 'pollux'], ['pollux', 'alhena']
  ]},
  { name: 'Can Mayor', lines: [
    ['sirius', 'mirzam'], ['sirius', 'wezen'], ['wezen', 'adhara']
  ]},
  { name: 'Leo', lines: [
    ['regulus', 'algieba'], ['algieba', 'zosma'], ['zosma', 'denebola'], ['denebola', 'regulus']
  ]},
  { name: 'Pegaso', lines: [
    ['markab', 'scheat'], ['scheat', 'alpheratz'], ['alpheratz', 'algenib'], ['algenib', 'markab']
  ]},
  { name: 'Andrómeda', lines: [
    ['alpheratz', 'mirach'], ['mirach', 'almach']
  ]},
  { name: 'Perseo', lines: [
    ['mirfak', 'algol']
  ]},
  { name: 'Sagitario', lines: [
    ['kausaustralis', 'kausmedia'], ['kausmedia', 'nunki'], ['nunki', 'ascella'],
    ['ascella', 'kausaustralis']
  ]},
  { name: 'Triángulo de Verano', lines: [
    ['vega', 'deneb'], ['deneb', 'altair'], ['altair', 'vega']
  ]}
];
