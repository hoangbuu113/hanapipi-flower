import { Link } from 'react-router-dom'

function BrandMark({ className = '', showTagline = true }) {
  const classes = ['brand-mark', className].filter(Boolean).join(' ')

  return (
    <Link className={classes} to="/" aria-label="Trang chủ Hanapipi Flower">
      <span className="brand-mark__name">Hanapipi Flower</span>
      {showTagline && (
        <span className="brand-mark__tagline">Hoa được chăm chút tinh tế.</span>
      )}
    </Link>
  )
}

export default BrandMark
