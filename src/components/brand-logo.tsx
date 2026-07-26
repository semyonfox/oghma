import Image from "next/image";

/**
 * The brand mark, themed.
 *
 * The artwork is white-filled with a green stroke, so it disappears against a
 * light background. `public/oghmanotes-light.svg` is the same file with its 73
 * fills changed from `#ffffff` to `#000000` — regenerate it from the master
 * whenever the logo changes:
 *
 *   python -c "d=open('public/oghmanotes.svg','rb').read(); \
 *     open('public/oghmanotes-light.svg','wb').write(d.replace(b'fill:#ffffff', b'fill:#000000'))"
 *
 * Both variants render and CSS picks one through the `dark` class variant. That
 * keeps the swap free of client JS, so it survives the manual theme toggle and
 * paints correctly on the first frame — the theme class is applied before paint
 * by the init script in `src/app/layout.js`, so there is no flash. The variant
 * that loses is `display:none`, which also drops it from the accessibility tree.
 */
export default function BrandLogo({
  size = 32,
  alt = "",
  className = "",
  priority = false,
}: {
  size?: number;
  /** Leave empty when the mark sits beside the wordmark or a labelled link. */
  alt?: string;
  className?: string;
  priority?: boolean;
}) {
  const shared = { width: size, height: size, alt, priority };

  return (
    <>
      <Image
        {...shared}
        src="/oghmanotes-light.svg"
        className={`dark:hidden ${className}`.trim()}
      />
      <Image
        {...shared}
        src="/oghmanotes.svg"
        className={`hidden dark:block ${className}`.trim()}
      />
    </>
  );
}
