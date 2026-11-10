/** Free licence reference photos from Wikimedia Commons, resized to 800px in app/public/handbook/diseases. */
export interface ReferencePhoto {
  src: string;
  alt: string;
  credit: string;
  license: string;
  source: string;
}

const photo = (
  file: string,
  alt: string,
  credit: string,
  license: string,
  source: string,
): ReferencePhoto => ({
  src: `/handbook/diseases/${file}`,
  alt,
  credit,
  license,
  source,
});

const PHOTOS: Readonly<Record<string, readonly ReferencePhoto[]>> = {
  "apple/apple-scab": [
    photo(
      "apple/apple-scab-1.jpg",
      "Apple Scab on Apple",
      "Fructibus",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Apple_scab_2017_D.jpg",
    ),
    photo(
      "apple/apple-scab-2.jpg",
      "Apple Scab on Apple",
      "Peggy Greb, USDA ARS",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Apple_scab.jpg",
    ),
  ],
  "apple/black-rot": [
    photo(
      "apple/black-rot-1.jpg",
      "Black Rot on Apple",
      "Clemson University",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Botryosphaeria_obtusa.jpg",
    ),
  ],
  "apple/cedar-apple-rust": [
    photo(
      "apple/cedar-apple-rust-1.jpg",
      "Cedar Apple Rust on Apple",
      "Littleinfo",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Cedar_apple_rust_on_crab_apple_leaf_upper_surface.JPG",
    ),
    photo(
      "apple/cedar-apple-rust-2.jpg",
      "Cedar Apple Rust on Apple",
      "Littleinfo",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Cedar_apple_rust_heavily_infected_leaf_underside.JPG",
    ),
  ],
  "bell-pepper/bacterial-spot": [
    photo(
      "bell-pepper/bacterial-spot-1.jpg",
      "Bacterial Spot on Bell Pepper",
      "Netty4299",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Bacterial_leaf_spot_on_pepper.jpg",
    ),
    photo(
      "bell-pepper/bacterial-spot-2.jpg",
      "Bacterial Spot on Bell Pepper",
      "Scot Nelson",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Bacterial_leaf_spot_of_pepper_(14954536360).jpg",
    ),
  ],
  "bell-pepper/phytophthora-blight": [
    photo(
      "bell-pepper/phytophthora-blight-1.jpg",
      "Phytophthora Blight on Bell Pepper",
      "Don Ferrin, Louisiana State University Agricultural Center, Bugwood.org",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:P._capsici_blight_on_sweet_pepper.jpg",
    ),
  ],
  "corn/common-rust": [
    photo(
      "corn/common-rust-1.jpg",
      "Common Rust on Corn",
      "Karl von Tubeuf and William G. Smith, Diseases of Plants",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Puccinia_sorghi_(01).jpg",
    ),
    photo(
      "corn/common-rust-2.jpg",
      "Common Rust on Corn",
      "Connie Tande, SDSU Plant Science Dept., Bugwood.org",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Puccinia_sorghi_(15).jpg",
    ),
  ],
  "corn/gray-leaf-spot": [
    photo(
      "corn/gray-leaf-spot-1.jpg",
      "Gray Leaf Spot on Corn",
      "Daren Mueller, Iowa State University, Bugwood.org",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Gray_leaf_spot_Cercospora_zeae-maydis_5465607.png",
    ),
  ],
  "corn/northern-corn-leaf-blight": [
    photo(
      "corn/northern-corn-leaf-blight-1.jpg",
      "Northern Corn Leaf Blight on Corn",
      "Chroanch",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:Northern_corn_leaf_blight.JPG",
    ),
  ],
  "grape/black-rot": [
    photo(
      "grape/black-rot-1.jpg",
      "Black Rot on Grape",
      "Clemson University, USDA Cooperative Extension Slide Series, Bugwood.org",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Guignardia_bidwellii_(black_rot)_on_grape_2.jpg",
    ),
    photo(
      "grape/black-rot-2.jpg",
      "Black Rot on Grape",
      "Clemson University, USDA Cooperative Extension Slide Series, Bugwood.org",
      "Public domain",
      "https://commons.wikimedia.org/wiki/File:Guignardia_bidwellii_(black_rot)_on_grape_3.jpg",
    ),
  ],
  "grape/esca": [
    photo(
      "grape/esca-1.jpg",
      "Esca on Grape",
      "Bauer Karl",
      "CC BY 3.0 at",
      "https://commons.wikimedia.org/wiki/File:ESCA_Blattsymptom_1.JPG",
    ),
    photo(
      "grape/esca-2.jpg",
      "Esca on Grape",
      "Geolina163 + 1971markus",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:HBLA_Klosterneuburg_Cabernet_Blanc_Esca_2.jpg",
    ),
  ],
  "grape/leaf-blight": [
    photo(
      "grape/leaf-blight-1.jpg",
      "Leaf Blight on Grape",
      "Annika Lindqvist",
      "CC BY 4.0",
      "https://commons.wikimedia.org/wiki/File:Pseudocercospora_vitis_154983434.jpg",
    ),
  ],
  "orange/huanglongbing": [
    photo(
      "orange/huanglongbing-1.jpg",
      "Huanglongbing on Orange",
      "Mmacbeth",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Citrus_greening.JPG",
    ),
    photo(
      "orange/huanglongbing-2.jpg",
      "Huanglongbing on Orange",
      "Florida Division of Plant Industry Archive, Bugwood.org",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Citrus_greening_UGA5201066.jpg",
    ),
  ],
  "peach/bacterial-spot": [
    photo(
      "peach/bacterial-spot-1.jpg",
      "Bacterial Spot on Peach",
      "Jerzy Opioła",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:Xanthomonas_arboricola_pv._pruni_WF4.jpg",
    ),
  ],
  "potato/late-blight": [
    photo(
      "potato/late-blight-1.jpg",
      "Late Blight on Potato",
      "Howard F. Schwartz, Colorado State University",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Late_blight_on_potato_leaf_2.jpg",
    ),
    photo(
      "potato/late-blight-2.jpg",
      "Late Blight on Potato",
      "Mary Ann Hansen, Virginia Tech",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Phytophthora_infestans_on_potato_leaf.jpg",
    ),
  ],
  "squash/powdery-mildew": [
    photo(
      "squash/powdery-mildew-1.jpg",
      "Powdery Mildew on Squash",
      "Dmitry Brant",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:Powdery_mildew_9.jpg",
    ),
    photo(
      "squash/powdery-mildew-2.jpg",
      "Powdery Mildew on Squash",
      "Schlaghecken Josef",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:K%C3%BCrbis-Cucurbita-Echter_Mehltau-Golovinomyces-4-JS.jpg",
    ),
  ],
  "strawberry/leaf-scorch": [
    photo(
      "strawberry/leaf-scorch-1.jpg",
      "Leaf Scorch on Strawberry",
      "Rasbak",
      "CC BY-SA 3.0",
      "https://commons.wikimedia.org/wiki/File:Rode-vlekkenziekte_(Diplocarpon_earlianum).jpg",
    ),
  ],
  "tomato/early-blight": [
    photo(
      "tomato/early-blight-1.jpg",
      "Early Blight on Tomato",
      "Dwight Sipler from Stow, MA, USA",
      "CC BY 2.0",
      "https://commons.wikimedia.org/wiki/File:Early_blight_on_tomato_leaves_(7871930010).jpg",
    ),
    photo(
      "tomato/early-blight-2.jpg",
      "Early Blight on Tomato",
      "Michal Maňas",
      "CC BY 4.0",
      "https://commons.wikimedia.org/wiki/File:Alternaria_solani_on_Solanum_lycopersicum.jpg",
    ),
  ],
  "tomato/late-blight": [
    photo(
      "tomato/late-blight-1.jpg",
      "Late Blight on Tomato",
      "Scot Nelson from Honolulu, Hawaii, USA",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Late_blight_of_tomato_caused_by_Phytophthora_infestans_(5815188381).jpg",
    ),
    photo(
      "tomato/late-blight-2.jpg",
      "Late Blight on Tomato",
      "Mary Ann Hansen, Virginia Tech",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Phytophthora_infestans_(late_blight)_on_tomato.jpg",
    ),
  ],
  "tomato/leaf-mold": [
    photo(
      "tomato/leaf-mold-1.jpg",
      "Leaf Mold on Tomato",
      "Elizabeth Bush, Virginia Tech",
      "CC BY 3.0",
      "https://commons.wikimedia.org/wiki/File:Tomato_Leaf_Mold.jpg",
    ),
  ],
  "tomato/septoria-leaf-spot": [
    photo(
      "tomato/septoria-leaf-spot-1.jpg",
      "Septoria Leaf Spot on Tomato",
      "Wolan268",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Tomato_septoria_leaf_spot_3026.jpg",
    ),
    photo(
      "tomato/septoria-leaf-spot-2.jpg",
      "Septoria Leaf Spot on Tomato",
      "Dr Parthasarathy Seethapathy, Tamil Nadu Agricultural University, Bugwood.org",
      "CC BY 3.0 us",
      "https://commons.wikimedia.org/wiki/File:Septoria_lycopersici_malagutii_leaf_spot_on_tomato_leaf.jpg",
    ),
  ],
  "tomato/spider-mites": [
    photo(
      "tomato/spider-mites-1.jpg",
      "Spider Mites on Tomato (spider mite or thrips damage)",
      "Natalka Ukraine (baby-bear.org)",
      "CC BY 4.0",
      "https://commons.wikimedia.org/wiki/File:Solanum_lycopersicum_leaves_with_spider_mite_or_thrips_damage_in_Dnipro_by_baby-bear.org.jpg",
    ),
  ],
  "tomato/target-spot": [
    photo(
      "tomato/target-spot-1.jpg",
      "Target Spot on Tomato",
      "Dr. Ken Pernezny, Gary Vallad, Abraham Fulmer",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:Corynespora_cassiicola_Ring-Spot_Symptoms_in_Tomato_Leaves.png",
    ),
  ],
  "tomato/tomato-mosaic-virus": [
    photo(
      "tomato/tomato-mosaic-virus-1.jpg",
      "Tomato Mosaic Virus on Tomato",
      "RosieScienceGal",
      "CC BY-SA 4.0",
      "https://commons.wikimedia.org/wiki/File:Leaf_with_ToMV.jpg",
    ),
  ],
  "tomato/tomato-yellow-leaf-curl-virus": [
    photo(
      "tomato/tomato-yellow-leaf-curl-virus-1.jpg",
      "Tomato Yellow Leaf Curl Virus on Tomato",
      "Kembangraps",
      "CC0",
      "https://commons.wikimedia.org/wiki/File:Yellow_curl_leaf_disease_Pj_IMG_3162.jpg",
    ),
  ],
};

/** Reference photos for one disease, empty when the catalog has none. */
export function diseasePhotos(plantSlug: string, diseaseSlug: string): readonly ReferencePhoto[] {
  return PHOTOS[`${plantSlug}/${diseaseSlug}`] ?? [];
}
