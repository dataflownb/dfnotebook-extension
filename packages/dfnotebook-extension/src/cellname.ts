import { DataflowCodeCell, DataflowCodeCellModel } from "@dfnotebook/dfcells";
import { truncateCellId } from "@dfnotebook/dfutils";
import { Dialog, ISessionContext, showDialog } from "@jupyterlab/apputils";
import { NotebookPanel } from "@jupyterlab/notebook";
import { Widget } from '@lumino/widgets';
import { DataflowNotebookModel, dfCommGetData, getCellsMetadata, getAllTags } from '@dfnotebook/dfnotebook'

// Add name to dfcode cell
export async function handleAddCellTag(notebook:NotebookPanel){
  const cellModel = notebook.content.activeCell?.model;
  const cell =  notebook.content.widgets.find(widget => widget.model === cellModel);
  if (cell == null || !(cell instanceof DataflowCodeCell)) {
    return;
  }
  await handleCellTagOperation(notebook, true);
}

// Modify dfcode cell name
export async function handleModifyCellTag(notebook: NotebookPanel){
  const cell = notebook.content.activeCell as DataflowCodeCell;
  if (cell == null || !(cell instanceof DataflowCodeCell)) {
    return;
  }
  await handleCellTagOperation(notebook, false);
}

//Replacing the existing cell name
function createConfirmReplaceCellTagDialog(existingCellTag: string): HTMLElement {
  const body = document.createElement('div');

  const message = document.createElement('p');
  message.textContent = `Cell name "${existingCellTag}" already exists.\nDo you want to use this name for the current cell and remove it from the existing one?`;
  
  body.appendChild(message);

  const updateReferencesLabel = document.createElement('label');
  updateReferencesLabel.textContent = 'Remove the existing cell name from all referenced locations:';
  updateReferencesLabel.classList.add('updateReferencesLabel');
  
  const updateReferencesCheckbox = document.createElement('input');
  updateReferencesCheckbox.name = 'updateReferences';
  updateReferencesCheckbox.type = 'checkbox';
  updateReferencesCheckbox.checked = true;
  updateReferencesCheckbox.classList.add('updateReferencesCheckbox');
  body.appendChild(updateReferencesLabel);
  body.appendChild(updateReferencesCheckbox);

  return body;
}

async function showConfirmReplaceCellTagDialog(existingCellTag: string): Promise<{ update: boolean, ref: boolean }> {
  const dialogNode = createConfirmReplaceCellTagDialog(existingCellTag);
  const widgetNode = new Widget();
  widgetNode.node.appendChild(dialogNode);

  const result = await showDialog({
      title: 'Confirm Cell Name Replacement',
      body: widgetNode,
      buttons: [
          Dialog.cancelButton(),
          Dialog.okButton({ label: 'Update' })
      ],
  });

  const updateReferencesCheckbox = dialogNode.querySelector('.updateReferencesCheckbox') as HTMLInputElement;
  return { update: result.button.accept, ref: updateReferencesCheckbox.checked };
}


/**
 * cell name dialog creation and usage
 */
function createCellTagDialog(isAddTagOperation: boolean, existingCellTag: string | null, errorMessage: string = ''): HTMLElement {
  const body = document.createElement('div');
  
  //show existing cell tag if it modify operation
  if(isAddTagOperation == false){
    const inputLabel = document.createElement('label');
    inputLabel.textContent = `Current cell name: ${existingCellTag}`;
    body.appendChild(inputLabel);
    body.appendChild(document.createElement('br'));
  }
    
  const input = document.createElement('input');
  input.name = 'newCellTagInput';
  input.placeholder = isAddTagOperation ? 'Enter cell name' : 'Enter new cell name';
  input.classList.add('cellTagInput');
  body.appendChild(input);
  body.appendChild(document.createElement('br'));
    
  const message = document.createElement('div');
  message.id = 'errorMessage';
  message.textContent = errorMessage;
  message.classList.add('cellTagErrorMessage');
  body.appendChild(message);
  return body;
}

async function showCellTagDialog(notebook: NotebookPanel, isAddTagOperation: boolean, cell: DataflowCodeCell, existingCellTag: string | null, existingCellTags: Set<string>, errorMessage: string = ''): Promise<void>{
  const dialogNode = createCellTagDialog(isAddTagOperation, existingCellTag, errorMessage);
  const widgetNode = new Widget();
  widgetNode.node.appendChild(dialogNode);
  
  const hexRegexp = new RegExp('^[0-9a-f]{8}$');
  const pythonVarRegexp = new RegExp('^[a-zA-Z0-9_]*$');

  let result: Dialog.IResult<unknown>;

  if(isAddTagOperation){
    result = await showDialog({
      title: 'Add Cell Name',
      body: widgetNode,
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: 'Add' })
      ],
      focusNodeSelector: 'input[name="newCellTagInput"]',
  });
  }
  else{
    result = await showDialog({
      title: 'Modify Cell Name',
      body: widgetNode,
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: 'Delete' }),
        Dialog.okButton({ label: 'Modify' })
      ],
      focusNodeSelector: 'input[name="newCellTagInput"]',
    });
  }
  

  if (result.button.accept) {
      const newCellTag = (dialogNode.querySelector('input[name="newCellTagInput"]') as HTMLInputElement).value.trim();
      const updateReferences = true;
      const deleteTag = result.button.label === 'Delete';

      if (deleteTag) {
        await cellTagOperation(notebook, cell, '', updateReferences);
        return;
      }
  
      if (newCellTag.trim() === '') {
        await showCellTagDialog(notebook, isAddTagOperation, cell, existingCellTag, existingCellTags, 'Cell name cannot be empty or whitespace. Enter a valid cell name.');
      } else if (!pythonVarRegexp.test(newCellTag)) {
        await showCellTagDialog(notebook, isAddTagOperation, cell, existingCellTag, existingCellTags, 'Invalid name (follow python identifier rules). Enter a valid cell name.');
      } else if (hexRegexp.test(newCellTag)) {
        await showCellTagDialog(notebook, isAddTagOperation, cell, existingCellTag, existingCellTags, 'Cell name cannot be 8 hex values. Enter a valid cell name.');
      } else if (existingCellTags.has(newCellTag)){
        const { update, ref } = await showConfirmReplaceCellTagDialog(newCellTag);
        const existingCell = getCellWithTag(notebook, newCellTag);
        
        if(update && existingCell){
          await cellTagOperation(notebook, existingCell, '', ref);
          await cellTagOperation(notebook, cell, newCellTag, true)
        }
        else{
          await showCellTagDialog(notebook, isAddTagOperation, cell, existingCellTag, existingCellTags, 'Cell name already exists. Enter a different cell name.');
        }
      } else {
        await cellTagOperation(notebook, cell, newCellTag, updateReferences)
      }
  }
  return;
}

async function cellTagOperation(notebook: NotebookPanel, cell: DataflowCodeCell, newCellTag: string, updateReferences: boolean){
  const cellUUID = truncateCellId(cell.model.id);
  cell.addTag(newCellTag);
  
  if (updateReferences) {
    await updateCellsByTag(notebook, cellUUID, notebook.sessionContext)
  }
  else if (updateReferences == false) {
    const all_tags: { [key: string]: string } = {};

    notebook.content.widgets.forEach(cell => {
      if (cell instanceof DataflowCodeCell) {
        const cId = truncateCellId(cell.model.id);
        const dfmetadata = cell.model.getMetadata('dfmetadata');
        if (dfmetadata.tag){
          all_tags[cId] = dfmetadata.tag;
        }
      }
    });

    notebook.content.widgets.forEach(async cell => {
      if (cell instanceof DataflowCodeCell) {
        const dfmetadata = cell.model.getMetadata('dfmetadata');
        let inputVarsMetadata = dfmetadata.inputVars;
        if (inputVarsMetadata && typeof inputVarsMetadata === 'object' && 'ref' in inputVarsMetadata) {
          const refValue = inputVarsMetadata.ref as { [key: string]: any };
          const tagRefValue: { [key: string]: any } = {};
          for (const ref_key in refValue) {
            if (ref_key != cellUUID && all_tags.hasOwnProperty(ref_key)) {
              tagRefValue[ref_key] = all_tags[ref_key];
            }
          }
          dfmetadata.inputVars = { 'ref': refValue, 'tag_refs': tagRefValue };
          cell.model.setMetadata('dfmetadata', dfmetadata);
          await updateCellsByTag(notebook, cellUUID, notebook.sessionContext, false, true)
        }
      }
    });
  }
}

export async function handleCellTagOperation(notebook: NotebookPanel, isAddTagOperation: boolean){
  const cell = notebook.content.activeCell as DataflowCodeCell;
  
  if (cell == null || !(cell instanceof DataflowCodeCell)) {
      return;
  }

  if (!isAddTagOperation && !cell.tag) {
    alert('This cell does not have a cell name.');
    return;
  }

  const existingCellTags = getExistingCellTags(notebook);
  await showCellTagDialog(notebook, isAddTagOperation, cell, cell.tag, existingCellTags, '');
}

/**
 * Update dfcode cells when cell name is added/modified/deleted.
 */
function getCellWithTag(notebook: NotebookPanel, tag: string): DataflowCodeCell | null {
  for (const cell of notebook.content.widgets) {
    if (cell instanceof DataflowCodeCell) {
      const cellTagValue = cell.model.getMetadata('dfmetadata')?.tag;
      if (cellTagValue?.trim() === tag.trim()) {
        return cell;
      }
    }
  }
  return null;
}

function getExistingCellTags(notebook: NotebookPanel): Set<string>{
  const existingCellTags = new Set<string>();
  notebook.content.widgets.forEach(cell => {
    if (cell instanceof DataflowCodeCell) {
      const cellTagValue = cell.model.getMetadata('dfmetadata')?.tag;
      if (cellTagValue) existingCellTags.add(cellTagValue);
    }
  });
  return existingCellTags;
}

export async function updateCellsByTag(notebook: NotebookPanel, cellUUID: string, sessionContext: ISessionContext, hideTags: boolean=false, updateInputTagsOnly: boolean=false) {
    let dfData = getCellsMetadata(notebook.model as DataflowNotebookModel, '');
    
    const executedCode: { [key: string]: string } = {};
    notebook.content.widgets.forEach((cell, index) => {
      if (cell instanceof DataflowCodeCell) {
        const cId = truncateCellId(cell.model.id);
        executedCode[cId] = (cell.model as DataflowCodeCellModel).lastExecutedCode;
      }
    });
    dfData.dfMetadata.executed_code = executedCode;
  
    if (hideTags) {
      dfData.dfMetadata.input_tags = {};
    }
  
    if (updateInputTagsOnly){
      dfData.dfMetadata.all_refs = {}
      dfData.dfMetadata.output_tags = {}
      dfData.dfMetadata.code_dict = {}
    }
  
    try {
      const response = await dfCommGetData(sessionContext, {'dfMetadata': dfData.dfMetadata, 'updateExecutedCode': true});
      updateNotebookCells(notebook, response, cellUUID, hideTags);
    } catch (error) {
      console.error('Error occured during kernel communication', error);
    }
}
  
function updateNotebookCells(notebook: NotebookPanel, content: any, cellUUID: string, hideTags: boolean): void {
    const all_Tags = getAllTags(notebook.model as DataflowNotebookModel);
    
    notebook.content.widgets.forEach((cell, index) => {
      if (cell instanceof DataflowCodeCell) {
        const cId = truncateCellId(cell.model.id);
  
        // Handle executed code updates
        if (content.executed_code_dict?.hasOwnProperty(cId)) {
          const updatedCode = content.executed_code_dict[cId];
          (cell.model as DataflowCodeCellModel).lastExecutedCode = updatedCode.trim();
        }
  
        // Handle code dictionary updates
        if (content.code_dict?.hasOwnProperty(cId)) {
          const updatedCode = content.code_dict[cId];
          cell.model.sharedModel.setSource(updatedCode);
        }
  
        //Updating the dependent cell's df-metadata when any cell is tagged/untagged
        if (cellUUID && !hideTags) {
          const dfmetadata = cell.model.getMetadata('dfmetadata');
          const inputVarsMetadata = dfmetadata.inputVars;
          if (inputVarsMetadata && typeof inputVarsMetadata === 'object' && 'ref' in inputVarsMetadata) {
            const refValue = inputVarsMetadata.ref as { [key: string]: any };
            let tagRefValue = inputVarsMetadata.tag_refs as { [key: string]: any };
            for (const ref_key in refValue) {
              if (ref_key == cellUUID && all_Tags.hasOwnProperty(ref_key)) {
                tagRefValue[cellUUID] = all_Tags[cellUUID];
              }
            }
            dfmetadata.inputVars = { 'ref': refValue, 'tag_refs': tagRefValue };
            cell.model.setMetadata('dfmetadata', dfmetadata);
          }
        }
      }
    });
}
