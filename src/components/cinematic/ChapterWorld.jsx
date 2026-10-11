import { chapterBackground } from './chapterScene.js'

export default function ChapterWorld({ chapter }) {
  return <div className="chapter-world" style={{ '--chapter-tone': chapter.palette.base, background: chapterBackground(chapter) }} aria-hidden="true" />
}
