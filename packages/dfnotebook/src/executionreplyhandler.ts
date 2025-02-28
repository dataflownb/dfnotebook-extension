import type { KernelMessage } from '@jupyterlab/services';
import { NotebookPanel } from '@jupyterlab/notebook';
import { DataflowCodeCell } from '@dfnotebook/dfcells';
import { DataflowNotebookModel } from './model';
import { truncateCellId } from '@dfnotebook/dfutils';

export async function updatedfNotebook(notebook: NotebookPanel|undefined, reply: KernelMessage.IExecuteReplyMsg): Promise<void> {
  const content = reply?.content as any;
  
  if (!content || !notebook) return;
  
  const allTags = getAllTags(notebook.model as DataflowNotebookModel);
  const cells = notebook.content.widgets;
  cells.filter(widget => widget instanceof DataflowCodeCell);
  notebook.content.widgets.forEach(cell => {
    if (cell instanceof DataflowCodeCell) {
      updateCellMetadata(cell, content, allTags)
    }
  });
}

function updateCellMetadata(cell: DataflowCodeCell, content: any, allTags: { [key: string]: string }): void {
  const cId = truncateCellId(cell.model.id);
  const dfmetadata = cell.model.getMetadata('dfmetadata') || {};

  if (content.persistent_code?.[cId]) {
    dfmetadata.persistentCode = content.persistent_code[cId];
  }

  if (content.identifier_refs?.[cId]) {
    const refs = content.identifier_refs[cId];
    dfmetadata.inputVars = {
      ref: refs,
      tag_refs: mapTagsToRefs(refs, allTags)
    };
  
    let cellOutputTags: string[] = [];
    for (let i = 0; i < cell.model.outputs.length; ++i) {
      const out = cell.model.outputs.get(i);
      if(out.metadata['output_tag']){
        cellOutputTags.push(out.metadata['output_tag'] as string);
      }
    }
    dfmetadata.outputVars = cellOutputTags;
    cell.executedCode = cell.model.sharedModel.getSource();
  }
  cell.model.setMetadata('dfmetadata', dfmetadata);
}

function mapTagsToRefs(refs: { [key: string]: any }, allTags: { [key: string]: string }): { [key: string]: string } {
  const tagRefs: { [key: string]: string } = {};

  Object.keys(refs).forEach(key => {
    if (allTags[key]) {
      tagRefs[key] = allTags[key];
    }
  });

  return tagRefs;
}

export function getAllTags(notebook: DataflowNotebookModel): { [key: string]: string } {
  const allTags: { [key: string]: string } = {};
  const cellsArray = Array.from(notebook.cells);
  
  cellsArray.forEach(cell => {
    if (cell.type === 'code') {
      const dfmetadata = cell.getMetadata('dfmetadata');
      const tag = dfmetadata?.tag;
      if (tag) {
        const cId = truncateCellId(cell.id);
        allTags[cId] = tag;
      }
    }
  });

  return allTags;
}