// extracted from Notea (MIT License)
export interface TrashMutationBody {
  action: "restore" | "delete";
  data: { id: string };
}

export interface TrashMutationResponse {
  success: true;
  parentId?: string | null;
}

export interface TrashListItem {
  id: string;
  title: string;
  isFolder: boolean;
  deletedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}
