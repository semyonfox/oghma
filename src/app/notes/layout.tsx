import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import CanvasIntegration from "@/components/CanvasIntegration";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CanvasIntegration />
      {children}
    </>
  );
}
