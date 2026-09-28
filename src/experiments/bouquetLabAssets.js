// Local prototype catalogue. Recipe data stores only these stable IDs and quantities.
import roseA from '../assets/bouquet-lab/raster/rose-pink-a.webp'
import roseB from '../assets/bouquet-lab/raster/rose-pink-b.webp'
import roseC from '../assets/bouquet-lab/raster/rose-pink-c.webp'
import tulipA from '../assets/bouquet-lab/raster/tulip-white-a.webp'
import tulipB from '../assets/bouquet-lab/raster/tulip-white-b.webp'
import baby from '../assets/bouquet-lab/raster/baby-breath.webp'
import eucalyptusA from '../assets/bouquet-lab/raster/eucalyptus-a.webp'
import eucalyptusB from '../assets/bouquet-lab/raster/eucalyptus-b.webp'
import pearl from '../assets/bouquet-lab/raster/pearl-spray.webp'
import wrapperBack from '../assets/bouquet-lab/raster/wrapper-back.webp'
import wrapperFront from '../assets/bouquet-lab/raster/wrapper-front.webp'
import ribbonPink from '../assets/bouquet-lab/raster/ribbon-pink.webp'
import ribbonCream from '../assets/bouquet-lab/raster/ribbon-cream.webp'

// Generated studio-style cutouts for this experiment only, not product photographs.
export const ingredients = [
  { id: 'rose', name: 'Hồng phấn', role: 'FOCAL', referencePrice: 45000, image: roseA, variants: [roseA, roseB, roseC], width: 31, active: true },
  { id: 'tulip', name: 'Tulip trắng', role: 'SECONDARY', referencePrice: 30000, image: tulipA, variants: [tulipA, tulipB], width: 25, active: true },
  { id: 'baby', name: 'Baby', role: 'FILLER', referencePrice: 15000, image: baby, width: 23, active: true },
  { id: 'eucalyptus', name: 'Bạch đàn', role: 'GREENERY', referencePrice: 10000, image: eucalyptusA, variants: [eucalyptusA, eucalyptusB], width: 30, active: true },
  { id: 'pearl', name: 'Ngọc trai', role: 'TOPPING', referencePrice: 12000, image: pearl, width: 17, active: true },
]
export const wrappers = [
  { id: 'ivory', name: 'Kem / blush', referencePrice: 35000, backImage: wrapperBack, frontImage: wrapperFront, active: true },
  { id: 'warm', name: 'Kem ấm', referencePrice: 35000, backImage: wrapperBack, frontImage: wrapperFront, filter: 'sepia(.28) saturate(.65)', active: true },
]
export const ribbons = [
  { id: 'pink', name: 'Satin hồng', referencePrice: 10000, image: ribbonPink, active: true },
  { id: 'cream', name: 'Satin kem', referencePrice: 10000, image: ribbonCream, active: true },
]

export const bouquetLabCatalogue = { ingredients, wrappers, ribbons }
