import { NextResponse } from 'next/server';
import { saveTreeToS3 } from '@/lib/notes/storage/s3-storage';
import { TreeModel } from '@/lib/notes/types/tree';

// full tree sync endpoint -- accepts the complete tree and writes it to S3
// used by addItem/deleteItem which modify tree structure in ways the
// single-item mutate endpoint can't handle
export async function POST(request: Request) {
  try {
    const tree: TreeModel = await request.json();

    if (!tree || !tree.rootId || !tree.items) {
      return NextResponse.json(
        { error: 'Invalid tree structure' },
        { status: 400 }
      );
    }

    // strip full note content from tree items before saving to S3
    // (note content is stored separately in notes/{id}/note.json)
    // keep minimal data so the tree can be reconstructed on load
    const cleanTree = {
      rootId: tree.rootId,
      items: Object.fromEntries(
        Object.entries(tree.items).map(([id, item]) => {
          const { data, ...rest } = item;
          // preserve data but strip content to reduce S3 payload
          const cleanData = data ? { ...data, content: undefined } : undefined;
          return [id, { ...rest, data: cleanData }];
        })
      ),
    } as TreeModel;

    await saveTreeToS3(cleanTree);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error syncing tree to S3:', error);
    return NextResponse.json(
      { error: 'Failed to sync tree' },
      { status: 500 }
    );
  }
}
