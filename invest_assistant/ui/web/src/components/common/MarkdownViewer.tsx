import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./MarkdownViewer.css";

type MarkdownViewerProps = {
  content: string;
};

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
