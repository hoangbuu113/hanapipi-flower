import { segmentVietnameseGraphemes } from './headlineGraphemes.js'

// Static visual text. Word boundaries keep natural wrapping; spaces reserve their
// existing width without an invisible animation tick. The heading owns its name.
export default function HeadlineText({ text, as: Tag = 'span' }) {
  return <Tag className="lab-copy-line" aria-hidden="true">
    {(text.match(/\S+|\s+/gu) ?? []).map((word, wordIndex) => /\s/u.test(word) ? word :
      <span className="lab-headline-word" key={wordIndex}>
        {segmentVietnameseGraphemes(word).map((grapheme, index) =>
          <span className="lab-headline-grapheme" key={index}>{grapheme}</span>)}
      </span>)}
  </Tag>
}
