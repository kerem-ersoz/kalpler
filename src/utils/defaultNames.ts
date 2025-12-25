// Turkish adjectives for generating default player names
const TURKISH_ADJECTIVES = [
  'Allahsız', 'Ayyaş', 'Ayıboğan',
  'Bahtsız', 'Baldırıçıplak',
  'Cesur', 'Cömert', 'Çakal', 'Çulsuz', 'TC Çapulcu',
  'Deli', 'Değişik', 'Dürüst',
  'Efsane', 'Enerjik',
  'Fedakar',
  'Gamsız', 'Güleryüzlü', 'Gavur',
  'Hareketli', 'Hayırsız',
  'Kahraman', 'Kararlı', 'Korkak', 'Kaygısız',
  'Leş',
  'Maceracı', 'Meraklı', 'Minnoş', 'Muhteşem',
  'Namert',
  'Özgür',
  'Pişkin',
  'Suriyeli', 'Suratsız', 'Şerefsiz', 'Şanslı', 'Şirin',
  'Tatlı', 'Tuhaf', 'Tekstürel',
  'Uğurlu', 'Usta', 'Ucube',
  'Yavuz', 'Yenilmez',
  'Zengin', 'Züğürt'
];

// Turkish nouns (animals, nature, objects) for generating default player names
const TURKISH_NOUNS = [
  'Amigo', 'Altin.ai', 'Acemi',
  'Birader', 'Bozkurt',
  'Çakal',
  'Davulcu',
  'Godoş', 'Gavur',
  'Haydut', 'Hemşehri',
  'Kral', 'Korsan',
  'Laranjeet',
  'Örgütçü',
  'Prens', 'Prenses', 'Pharanjeet',
  'Reis',
  'Şahin', 'Şef', 'Suriyeli',
  'Tabip',
  'Üstad', 'Unc',
  'Yurttaş'
];

/**
 * Generates a random default player name from Turkish adjective + noun
 */
export function generateDefaultName(): string {
  const adjective = TURKISH_ADJECTIVES[Math.floor(Math.random() * TURKISH_ADJECTIVES.length)];
  const noun = TURKISH_NOUNS[Math.floor(Math.random() * TURKISH_NOUNS.length)];
  return `${adjective} ${noun}`;
}
