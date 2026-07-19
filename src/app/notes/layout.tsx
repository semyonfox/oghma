import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import CanvasImportNotifications from "@/components/canvas/canvas-import-notifications";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CanvasImportNotifications />
      {children}
    </>
  );
}
