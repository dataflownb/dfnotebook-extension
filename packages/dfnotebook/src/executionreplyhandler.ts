import type { KernelMessage } from '@jupyterlab/services';
import { DataflowCodeCellModel } from '@dfnotebook/dfcells';
import { DataflowNotebookModel } from './model';
import { truncateCellId } from '@dfnotebook/dfutils';
import { Cell } from '@jupyterlab/cells';

export async function updatedfNotebook(notebook: DataflowNotebookModel, reply: KernelMessage.IExecuteReplyMsg | void, executedCell: Cell): Promise<void> {
  let content = reply?.content as any;

  if(!reply && !executedCell.model.sharedModel.getSource().trim()){
    const cellId = truncateCellId(executedCell.model.sharedModel.getId())
    content = {
      persistent_code: { [cellId]: '' }, 
      identifier_refs: { [cellId]: {} }
    };
  }

  if (!content || !notebook) return;
  
  const allTags = getAllTags(notebook);
  const cellsArray = Array.from(notebook.cells);
  cellsArray.forEach(cell => {
    if (cell.type === 'code') {
      updateCellMetadata(cell as DataflowCodeCellModel, content, allTags)
    }
  });
}

function updateCellMetadata(cell: DataflowCodeCellModel, content: any, allTags: { [key: string]: string }): void {
  const cId = truncateCellId(cell.id);
  const dfmetadata = cell.getMetadata('dfmetadata');
  
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
    for (let i = 0; i < cell.outputs.length; ++i) {
      const out = cell.outputs.get(i);
      if(out.metadata['output_tag']){
        cellOutputTags.push(out.metadata['output_tag'] as string);
      }
    }
    dfmetadata.outputVars = cellOutputTags;
    (cell as DataflowCodeCellModel).lastExecutedCode = cell.sharedModel.getSource();
  }
  cell.setMetadata('dfmetadata', dfmetadata);
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