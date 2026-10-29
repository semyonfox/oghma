// eight hues ordered so neighbouring topics never look alike, even as 6px dots.
// the values live in globals.css so light and dark each get readable shades
export const TOPIC_COLOUR_COUNT = 8;

/** the colour of a topic by its position in the map's topic list, shared by the map and the tree */
export function topicColour(index: number): string {
  return `var(--color-topic-${index % TOPIC_COLOUR_COUNT})`;
}
