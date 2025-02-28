import { DataflowCodeCell } from "@dfnotebook/dfcells";
import { truncateCellId } from "@dfnotebook/dfutils";
import { Dialog, ISessionContext, showDialog } from "@jupyterlab/apputils";
import { NotebookPanel } from "@jupyterlab/notebook";
import { Widget } from '@lumino/widgets';
import { DataflowNotebookModel, dfCommGetData, getCellsMetadata, getAllTags } from '@dfnotebook/dfnotebook'

/**
 * Adding a name to the dfcode cell
 */

function createAddCellNameDialog(errorMessage: string = ''): HTMLElement{
    const body = document.createElement('div');
    const input = document.createElement('input');
    input.name = 'cellNameInput';
    input.placeholder = 'Enter tag name';
    input.classList.add('cellNameInput');

    const message = document.createElement('div');
    message.id = 'addCellNameErrorMessage';
    message.textContent = errorMessage;
    message.classList.add('cellNameErrorMessage');

    body.appendChild(input);
    body.appendChild(document.createElement('br'));
    body.appendChild(message);

    return body;
}

async function showAddCellNameDialog( existingCellNames: Set<string>, errorMessage: string = ''): Promise< string | null>{
    const dialogNode = createAddCellNameDialog(errorMessage);
    const widgetNode = new Widget();
    widgetNode.node.appendChild(dialogNode);

    const hexRegexp = new RegExp('^[0-9a-f]{8}$');
    const pythonVarRegexp = new RegExp('^[a-zA-Z0-9_]*$');

    const result = await showDialog({
      title: 'Add Cell Tag',
      body: widgetNode,
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: 'Add' })
      ],
      focusNodeSelector: 'input[name="cellNameInput"]',
    });

    if (result.button.accept) {
      const newTag = (dialogNode.querySelector('input[name="cellNameInput"]') as HTMLInputElement).value;
      if (newTag.trim() === '') {
        return await showAddCellNameDialog(existingCellNames, 'Tag cannot be empty or whitespace. Enter a valid tag.');
      } else if (!pythonVarRegexp.test(newTag)) {
        return await showAddCellNameDialog(existingCellNames, 'Invalid name (follow python identifier rules). Enter a valid tag.');
      } else if (hexRegexp.test(newTag)) {
        return await showAddCellNameDialog(existingCellNames, 'Cell tags cannot be 8 hex values. Enter a valid tag.');
      } else if (existingCellNames.has(newTag)){
        return await showAddCellNameDialog(existingCellNames, 'This tag already exists. Enter a different tag.');
      } else {
        return newTag;
      }
    }
    return null;
}

export async function handleAddCellTag(notebook:NotebookPanel){
    const cellModel = notebook.content.activeCell?.model;
    const cell =  notebook.content.widgets.find(widget => widget.model === cellModel);
    if (cell == null || !(cell instanceof DataflowCodeCell)) {
      return;
    }

    const existingCellNames = getExistingCellNames(notebook);
        
    let newCellName = await showAddCellNameDialog(existingCellNames, '');
    const cellUUID = truncateCellId(cell.model.id)

    if (newCellName && newCellName.length > 0) {
      cell.addTag(newCellName);
      await updateCellsByName(notebook, cellUUID, notebook.sessionContext)
    }
}

/**
 * Modifying dfcode cell name
 */

function modifyCellNameDialog(existingCellName: string | null, errorMessage: string = ''): HTMLElement {
    const body = document.createElement('div');
    
      const inputLabel = document.createElement('label');
      inputLabel.textContent = `Current Tag: ${existingCellName}`;
    
      const input = document.createElement('input');
      input.name = 'newCellNameInput';
      input.placeholder = 'Enter new tag';
      input.classList.add('cellNameInput');
    
      const updateReferencesLabel = document.createElement('label');
      updateReferencesLabel.textContent = 'Update references';
      updateReferencesLabel.classList.add('updateReferencesLabel');
    
      const updateReferencesCheckbox = document.createElement('input');
      updateReferencesCheckbox.name = 'updateReferences';
      updateReferencesCheckbox.type = 'checkbox';
      updateReferencesCheckbox.checked = true;
      updateReferencesCheckbox.classList.add('updateReferencesCheckbox');
    
      const message = document.createElement('div');
      message.id = 'errorMessage';
      message.textContent = errorMessage;
      message.classList.add('cellNameErrorMessage');
    
      body.appendChild(inputLabel);
      body.appendChild(document.createElement('br'));
      body.appendChild(input);
      body.appendChild(document.createElement('br'));
      body.appendChild(updateReferencesLabel);
      body.appendChild(updateReferencesCheckbox);
      body.appendChild(message);
    
      return body;
}

async function showModifyCellNameDialog(existingCellName: string, existingCellNames: Set<string>, errorMessage: string = ''): Promise<{ newTag: string, updateReferences: boolean } | null>{
    const dialogNode = modifyCellNameDialog(existingCellName, errorMessage);
    const widgetNode = new Widget();
    widgetNode.node.appendChild(dialogNode);
    
    const hexRegexp = new RegExp('^[0-9a-f]{8}$');
    const pythonVarRegexp = new RegExp('^[a-zA-Z0-9_]*$');

    const result = await showDialog({
        title: 'Modify Cell Tag',
        body: widgetNode,
        buttons: [
          Dialog.cancelButton(),
          Dialog.okButton({ label: 'Delete' }),
          Dialog.okButton({ label: 'Modify' })
        ],
        focusNodeSelector: 'input[name="newCellNameInput"]',
    });

    if (result.button.accept) {
        const newTag = (dialogNode.querySelector('input[name="newCellNameInput"]') as HTMLInputElement).value;
        const updateReferences = (dialogNode.querySelector('input[name="updateReferences"]') as HTMLInputElement).checked;
        const deleteTag = result.button.label === 'Delete';

        if (deleteTag) {
            return { newTag: '', updateReferences };
        }
    
        if (newTag.trim() === '') {
            return await showModifyCellNameDialog(existingCellName, existingCellNames, 'Tag cannot be empty or whitespace. Enter a valid tag.');
        } else if (!pythonVarRegexp.test(newTag)) {
            return await showModifyCellNameDialog(existingCellName, existingCellNames, 'Invalid name (follow python identifier rules). Enter a valid tag.');
        } else if (hexRegexp.test(newTag)) {
            return await showModifyCellNameDialog(existingCellName, existingCellNames, 'Cell tags cannot be 8 hex values. Enter a valid tag.');
        } else if (existingCellNames.has(newTag)){
            return await showModifyCellNameDialog(existingCellName, existingCellNames, 'This tag already exists. Enter a different tag.');
        } else {
            return { newTag, updateReferences };
        }
    }
    return null;
}

export async function handleModifyCellTag(notebook: NotebookPanel){
    const cell = notebook.content.activeCell as DataflowCodeCell;
    
    if (cell == null || !(cell instanceof DataflowCodeCell)) {
        return;
    }

    if (!cell.tag) {
      alert('This cell does not have a tag.');
      return;
    }

    const existingCellNames = getExistingCellNames(notebook);
    const result = await showModifyCellNameDialog(cell.tag, existingCellNames, '');
    const cellUUID = truncateCellId(cell.model.id);
    if (result) {
      const { newTag, updateReferences } = result;
      cell.addTag(newTag);
    
      if (updateReferences) {
        await updateCellsByName(notebook, cellUUID, notebook.sessionContext)
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
              await updateCellsByName(notebook, cellUUID, notebook.sessionContext, false, true)
            }
          }
        });
      }
    }
}

/**
 * Update dfcode cells when cell name is added/modified/deleted.
 */

function getExistingCellNames(notebook: NotebookPanel): Set<string>{
  const existingCellNames = new Set<string>();
  notebook.content.widgets.forEach(cell => {
    if (cell instanceof DataflowCodeCell) {
      const cellTagValue = cell.model.getMetadata('dfmetadata')?.tag;
      if (cellTagValue) existingCellNames.add(cellTagValue);
    }
  });
  return existingCellNames;
}

export async function updateCellsByName(notebook: NotebookPanel, cellUUID: string, sessionContext: ISessionContext, hideTags: boolean=false, updateInputTagsOnly: boolean=false) {
    let dfData = getCellsMetadata(notebook.model as DataflowNotebookModel, '');
    
    const executedCode: { [key: string]: string } = {};
    notebook.content.widgets.forEach((cell, index) => {
      if (cell instanceof DataflowCodeCell) {
        const cId = truncateCellId(cell.model.id);
        executedCode[cId] = cell.executedCode;
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
          cell.executedCode = updatedCode.trim();
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