module.exports = (md, options) => {
  const defaultOptions = {
    injectMarkdownHeadings: false,
    slugify: content => require('slugify')(content, { lower: true })
  }

  const config = Object.assign(defaultOptions, options)
  const { slugify } = config

  md.core.ruler.push('md_headings', state => {
    const { tokens, env } = state
    const injectMarkdownHeadings = env.getAttribute('injectMarkdownHeadings')
    const headings = []

    if (
      injectMarkdownHeadings === true ||
      (injectMarkdownHeadings !== false && config.injectMarkdownHeadings)
    ) {
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'heading_close') {
          continue
        }

        const heading = tokens[i - 1]

        if (heading.type === 'inline') {
          let text

          if (
            heading.children &&
            heading.children.length > 0 &&
            heading.children[0].type === 'link_open'
          ) {
            // headings that contain links have to be processed
            // differently since nested links aren't allowed in markdown
            text = heading.children[1].content
          } else {
            text = heading.content
          }

          const slug = slugify(text)

          headings.push({
            text,
            slug
          })
        }
      }
    }

    state.env.setAttribute('markdownHeadings', headings)
  })
}
