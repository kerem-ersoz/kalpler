// Turkish adjectives for generating default player names
const TURKISH_ADJECTIVES = [
  'Akıllı', 'Asil', 'Atik', 'Aydın',
  'Barışçıl', 'Bilge', 'Büyülü',
  'Canlı', 'Cesur', 'Cömert', 'Çalışkan', 'Çevik',
  'Deli', 'Derli', 'Dürüst',
  'Efsane', 'Eğlenceli', 'Enerjik',
  'Fedakar', 'Fırtınalı',
  'Gizli', 'Gözüpek', 'Güçlü', 'Güleryüzlü', 'Güzel',
  'Hareketli', 'Harika', 'Heyecanlı', 'Hızlı', 'Hoş',
  'İhtişamlı', 'İnanılmaz',
  'Kahraman', 'Kararlı', 'Kıvrak', 'Komik', 'Korkusuz', 'Kudretli',
  'Maceracı', 'Maskeli', 'Masum', 'Mavi', 'Meraklı', 'Minnoş', 'Mistik', 'Muhteşem', 'Mutlu',
  'Nazik', 'Neşeli',
  'Oyuncu', 'Özgür',
  'Parlak', 'Pembe', 'Pırıl',
  'Sabırlı', 'Sakin', 'Sarı', 'Serin', 'Sevimli', 'Sihirli', 'Şanslı', 'Şen', 'Şirin',
  'Tatlı', 'Tuhaf', 'Tutkulu',
  'Uçan', 'Uğurlu', 'Usta',
  'Vahşi', 'Yaman', 'Yaramaz', 'Yavuz', 'Yenilmez', 'Yeşil', 'Yıldız', 'Yiğit',
  'Zarif', 'Zeki', 'Zengin',
];

// Turkish nouns (animals, nature, objects) for generating default player names
const TURKISH_NOUNS = [
  'Arı', 'Aslan', 'At', 'Atmaca', 'Ayı',
  'Balık', 'Baykuş', 'Boğa', 'Böcek',
  'Canavar', 'Ceylan', 'Civciv',
  'Çakal', 'Çaylak',
  'Deve', 'Domuz', 'Doruk',
  'Ejderha',
  'Fare', 'Fil', 'Flamingo',
  'Geyik', 'Gezgin', 'Goril', 'Güvercin',
  'Horoz',
  'Kahraman', 'Kaplan', 'Karınca', 'Kartal', 'Kedi', 'Kelebek', 'Koala', 'Kral', 'Korsan', 'Kuğu', 'Kurt', 'Kuş',
  'Leopar', 'Leylek',
  'Maymun', 'Mavi',
  'Ninja',
  'Ördek',
  'Panda', 'Papağan', 'Pelikan', 'Penguen', 'Peri', 'Prens', 'Prenses',
  'Samurai', 'Serçe', 'Sincap', 'Solucan', 'Şahin', 'Şövalye',
  'Tavşan', 'Timsah', 'Tilki', 'Turna',
  'Vaşak',
  'Yengeç', 'Yılan', 'Yunus',
  'Zebra', 'Zürafa',
];

/**
 * Generates a random default player name from Turkish adjective + noun
 */
export function generateDefaultName(): string {
  const adjective = TURKISH_ADJECTIVES[Math.floor(Math.random() * TURKISH_ADJECTIVES.length)];
  const noun = TURKISH_NOUNS[Math.floor(Math.random() * TURKISH_NOUNS.length)];
  return `${adjective} ${noun}`;
}
