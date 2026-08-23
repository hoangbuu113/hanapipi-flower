function Container({ as: Element = 'div', className = '', children }) {
  const classes = ['site-container', className].filter(Boolean).join(' ')

  return <Element className={classes}>{children}</Element>
}

export default Container
