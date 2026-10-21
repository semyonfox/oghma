import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import NotesShell from "@/components/notes/notes-shell";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NotesShell />
      {children}
    </>
  );
}
