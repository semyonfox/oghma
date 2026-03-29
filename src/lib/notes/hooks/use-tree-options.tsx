// extracted from Notea (MIT License)
import { NOTE_DELETED } from "@/lib/notes/types/meta";
import { TreeModel } from "@/lib/notes/types/tree";
import { useMemo } from "react";
import useI18n from "./use-i18n";

export interface TreeOption {
  id: string;
  label: string;
}

export const useTreeOptions = (tree: TreeModel) => {
  const { t } = useI18n();
  const options: TreeOption[] = useMemo(
    () =>
      Object.values(tree.items).reduce<TreeOption[]>((items, cur) => {
        if (cur.data?.deleted !== NOTE_DELETED.DELETED) {
          items.push({
            id: cur.id,
            label:
              cur.data?.title ||
              (cur.id === tree.rootId ? t("Root Page") : t("Untitled")),
          });
        }
        return items;
      }, []),
    [t, tree.items, tree.rootId],
  );

  return options;
};
