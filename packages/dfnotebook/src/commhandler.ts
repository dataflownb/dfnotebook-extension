import { ISessionContext } from '@jupyterlab/apputils';
import { DataflowCodeCellModel } from '@dfnotebook/dfcells';
import { DataflowNotebookModel } from './model';
import { truncateCellId } from '@dfnotebook/dfutils';

export async function dfCommPostData(notebook: DataflowNotebookModel, sessionContext: ISessionContext): Promise<void> {
    const dfData = getCellsMetadata(notebook, '');
    if (!notebook.getMetadata('enable_tags')) {
      dfData.dfMetadata.input_tags = {};
    }
    try {
      const response = await dfCommGetData(sessionContext, {'dfMetadata': dfData.dfMetadata});
      if (response?.code_dict && Object.keys(response.code_dict).length > 0) {
        await updateNotebookCells(notebook, response.code_dict);
      }
    } catch (error) {
      console.error('Error during kernel communication:', error);
    }
}

export async function dfCommGetData(sessionContext: ISessionContext, commData: any): Promise<any> {
  return new Promise<void>((resolve) => {
    const comm = sessionContext.session?.kernel?.createComm('dfcode');
    if (!comm) {
      resolve();
      return;
    }
    comm.open();
    comm.send(commData);
    comm.onMsg = (msg: any) => {
      const content = msg.content.data;
      resolve(content);
    };
  });
}

async function updateNotebookCells(notebook: DataflowNotebookModel, codeDict: { [key: string]: any }) {
  const cellsArray = Array.from(notebook.cells);
  cellsArray.forEach(c => {
    if (c.type === 'code'){
      const cell = c as DataflowCodeCellModel;
      const cId = truncateCellId(cell.id);
      if (codeDict.hasOwnProperty(cId)) {
        const updatedCode = codeDict[cId];
        const dfmetadata = cell.getMetadata('dfmetadata');
        const lastExecutedCode = (cell as DataflowCodeCellModel).lastExecutedCode
        if (lastExecutedCode !== cell.sharedModel.getSource()) {
          cell.sharedModel.setSource(updatedCode);
          (cell as DataflowCodeCellModel).lastExecutedCode = updatedCode.trim();
        } else {
          (cell as DataflowCodeCellModel).lastExecutedCode = updatedCode.trim();
          cell.sharedModel.setSource(updatedCode);

        }
        cell.setMetadata('dfmetadata', dfmetadata);
      }
    }
  });
}

export function getCellsMetadata(notebook: DataflowNotebookModel, cellUUID: string) {
    const codeDict: { [key: string]: string } = {};
    const cellIdModelMap: { [key: string]: any } = {};
    const outputTags: { [key: string]: string[] } = {};
    const inputTags: { [key: string]: string } = {};
    const allRefs: { [key: string]: { [key: string]: string[] } } = {};
    const cellsArray = Array.from(notebook.cells);

    cellsArray.forEach(cell => {
      if (cell.type === 'code') {
        const c = cell as DataflowCodeCellModel;
        const cId = truncateCellId(c.id);
        const dfmetadata = c.getMetadata('dfmetadata');
        if(!dfmetadata.persistentCode)
        {
          cellIdModelMap[cId] = c;
          return;
        }
        const inputTag = dfmetadata?.tag;

        if (inputTag) {
          inputTags[inputTag] = cId;
        }

        codeDict[cId] = c.sharedModel.getSource();
        cellIdModelMap[cId] = c;
        outputTags[cId] = dfmetadata?.outputVars;
        allRefs[cId] = dfmetadata?.inputVars;      
      }
    });

    const dfMetadata = {
      // FIXME replace with utility function (see dfcells/widget)
      uuid: cellUUID,
      code_dict: codeDict,
      output_tags: outputTags,
      input_tags: inputTags,
      auto_update_flags: {},
      force_cached_flags: {},
      all_refs: allRefs,
      executed_code: {}
    };
    return { dfMetadata, cellIdModelMap };
}