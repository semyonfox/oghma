
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from "@headlessui/react";
import {
  AcademicCapIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  DocumentPlusIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  QueueListIcon,
  SparklesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import type { StudyMapSnapshot } from "@/lib/study-map/types";
import {
  islandButton,
  islandDivider,
  menuHeadingClass,
  menuItemClass,
  menuPanelClass,
  menuSeparatorClass,
} from "./study-chrome";
import type { Panel } from "./study-workspace-shared";

function MenuEntry({
  label,
  icon: Icon,
  onClick,
  detail,
  disabled = false,
}: {
  label: string;
  icon: typeof TagIcon;
  onClick: () => void;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <MenuItem disabled={disabled}>
      <button
        type="button"
        className={menuItemClass}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon
          className="h-4 w-4 shrink-0 text-text-tertiary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">{label}</span>
        {detail && (
          <span className="text-xs text-text-tertiary" aria-hidden="true">
            {detail}
          </span>
        )}
      </button>
    </MenuItem>
  );
}

interface ModuleMenuProps {
  snapshot: StudyMapSnapshot;
  /** an operation is running, so actions that start another wait */
  busy: boolean;
  toCheck: number;
  reviewedTopics: number;
  findingTopics: boolean;
  classifying: boolean;
  failedCount: number;
  openPanel: (panel: Panel) => void;
  onFindTopics: () => void;
  onSync: () => void;
  onClassify: () => void;
}

/** the module island's menu: panels, materials and the classification actions */
export function ModuleMenu({
  snapshot,
  busy,
  toCheck,
  reviewedTopics,
  findingTopics,
  classifying,
  failedCount,
  openPanel,
  onFindTopics,
  onSync,
  onClassify,
}: ModuleMenuProps) {
  return (
    <>
      <span className={islandDivider} aria-hidden="true" />
      <Menu>
        <MenuButton
          className={islandButton}
          aria-label="Module menu"
          title="Topics, materials, exam history and settings"
        >
          <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden="true" />
          <span className="max-lg:hidden" aria-hidden="true">
            Module
          </span>
        </MenuButton>
        <MenuItems anchor="bottom end" className={menuPanelClass}>
          <MenuSection>
            <MenuHeading className={`${menuHeadingClass} truncate`}>
              {snapshot.map.name}
            </MenuHeading>
            <MenuEntry
              label="Topics"
              icon={TagIcon}
              onClick={() => openPanel("topics")}
              detail={
                toCheck > 0 ? `${toCheck} to check` : `${snapshot.map.topics.length}`
              }
            />
            <MenuEntry
              label="Materials"
              icon={QueueListIcon}
              onClick={() => openPanel("materials")}
              detail={`${snapshot.materials.length}`}
            />
            <MenuEntry
              label="Exam history"
              icon={AcademicCapIcon}
              onClick={() => openPanel("exams")}
            />
          </MenuSection>
          <MenuSeparator className={menuSeparatorClass} />
          <MenuEntry
            label="Add materials"
            icon={DocumentPlusIcon}
            onClick={() => openPanel("add")}
            disabled={busy}
          />
          <MenuEntry
            label="Module settings"
            icon={Cog6ToothIcon}
            onClick={() => openPanel("settings")}
          />
          {(snapshot.provider.generationReady || !snapshot.map.autoClassify) && (
            <MenuSeparator className={menuSeparatorClass} />
          )}
          {snapshot.provider.generationReady && (
            <MenuEntry
              label={snapshot.map.topics.length > 0 ? "Find topics again" : "Find topics"}
              icon={SparklesIcon}
              onClick={onFindTopics}
              disabled={busy || findingTopics}
            />
          )}
          {!snapshot.map.autoClassify && (
            <MenuEntry
              label="Sync sources"
              icon={ArrowPathIcon}
onClick={onSync}
              disabled={
                busy || (!snapshot.map.rootNoteId && !snapshot.map.canvasCourseId)
              }
            />
          )}
          {!snapshot.map.autoClassify && (
            <MenuEntry
              label="Classify materials"
              icon={SparklesIcon}
              onClick={onClassify}
              disabled={
                busy ||
                !snapshot.provider.ready ||
                reviewedTopics === 0 ||
                snapshot.materials.length === 0 ||
                classifying
              }
            />
          )}
          {failedCount > 0 && (
            <>
              <MenuSeparator className={menuSeparatorClass} />
              <MenuEntry
                label="Processing errors"
                icon={ExclamationTriangleIcon}
                onClick={() => openPanel("topics")}
                detail={`${failedCount}`}
              />
            </>
          )}
        </MenuItems>
      </Menu>
    </>
  );
}
