function SectionHeading({
  as: Heading = 'h2',
  centered = false,
  description,
  eyebrow,
  title,
}) {
  const classes = ['section-heading', centered && 'section-heading--centered']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Heading className="section-heading__title">{title}</Heading>
      {description && <p className="section-heading__description">{description}</p>}
    </div>
  )
}

export default SectionHeading
