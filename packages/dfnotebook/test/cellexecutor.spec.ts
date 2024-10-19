//import { runCell } from '../src/cellexecutor';
import {getdfData} from '../src/cellexecutor';
import { CodeCell, type ICodeCellModel } from '@jupyterlab/cells';
import { SessionContext, ISessionContext } from '@jupyterlab/apputils';
import { DataflowCodeCell  } from '@dfnotebook/dfcells';
import { createSessionContext } from '@jupyterlab/apputils/lib/testutils';
import { JupyterServer } from '@jupyterlab/testing';
import { DataflowNotebookModel, DataflowNotebook as Notebook } from '../src';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import * as utils from './utils';
import { INotebookModel, StaticNotebook as StaticNotebookType } from '@jupyterlab/notebook';
import { NBTestUtils } from '@jupyterlab/testutils';
//import { NBTestUtils } from '@jupyterlab/notebook/lib/testutils';
//import { updateNotebookCellsWithTag }  from '../../dfnotebook-extension/src/index'

describe('Identifier reference update', () => {
  let sessionContext: ISessionContext;
  const server = new JupyterServer();
  let widget: Notebook;
  let rendermime: IRenderMimeRegistry;
  let notebook: INotebookModel;
  const contentFactory = NBTestUtils.createCodeCellFactory();
  
  beforeAll(async () => {
    rendermime = utils.defaultRenderMime();
    await server.start({'additionalKernelSpecs':{'dfpython3':{'argv':['python','-m','dfkernel','-f','{connection_file}'],'display_name':'DFPython 3','language':'python'}}});
    console.log('********************************************Kernel creating');
    
    sessionContext = await createSessionContext(
      {'kernelPreference':
      {'name':'dfpython3','autoStartDefault':true,'shouldStart':true}});
  
    await (sessionContext as SessionContext).initialize();
    await sessionContext.session?.kernel?.info;
    await sessionContext.session?.id;
    await sessionContext.startKernel();
    console.log('********************************************Kernel started, status:', sessionContext.session?.kernel?.status);
    console.log('*******Kernel info:', await sessionContext.session?.kernel?.info);
    console.log('*******Kernel name:', await sessionContext.session?.kernel?.name);
  }, 30000);

  afterAll(async () => {
    await sessionContext.shutdown();
    await server.shutdown();
  });
  
  beforeEach(async () => {
    widget = new Notebook({
      rendermime,
      contentFactory: utils.createNotebookFactory(),
      mimeTypeService: utils.mimeTypeService,
      notebookConfig: {
        ...StaticNotebookType.defaultNotebookConfig,
        windowingMode: 'none'
      }
    });
    const model = new DataflowNotebookModel();
    //const model = new NotebookModel();
    widget.model = model;//new DataflowNotebookModel();
    model.sharedModel.clearUndoHistory();
    // widget.activeCellIndex = 0;
    console.log('*********************************************Before each test, kernel status:', sessionContext.session?.kernel?.status);
    notebook = widget.model;
    // if (!notebook) {
    //   throw new Error('Notebook model is null');
    // }
  });
    
  afterEach(() => {
    widget.model?.dispose();
    widget.dispose();
    utils.clipboard.clear();
  });

  // afterEach(() => {
  //   return sessionContext.shutdown();
  // });

  // async function runNotebookCell(notebook: INotebookModel, cellModel: ICodeCellModel) {
  //   const cell = new DataflowCodeCell({
  //     model: cellModel,
  //     rendermime: rendermime,
  //     contentFactory: NBTestUtils.createBaseCellFactory()
  //   });

  //   const result = await runCell({
  //     cell,
  //     notebook,
  //     sessionContext,
  //     notebookConfig: {
  //       defaultCell: 'code',
  //       disableDocumentWideUndoRedo: false,
  //       enableKernelInitNotification: true,
  //       maxNumberOutputs: 50,
  //       windowingMode: 'none',
  //       scrollPastEnd: true,
  //       showHiddenCellsButton: false,
  //       recordTiming: false,
  //       overscanCount: 1,
  //       renderingLayout: 'default',
  //       inputHistoryScope: 'session',
  //       sideBySideLeftMarginOverride: 'none',
  //       sideBySideRightMarginOverride: 'none',
  //       sideBySideOutputRatio: 0
  //     },
  //     onCellExecuted: ({ cell, success, error }) => {
  //       console.log(`Cell executed: ${success}`);
  //       if (error) {
  //         console.error(error);
  //       }
  //     },
  //     onCellExecutionScheduled: ({ cell }) => {
  //       console.log('Cell execution scheduled');
  //     }
  //   });

  //   return result;
  // }

  describe('Update references with UUID', () => {
    it('Reference UUID is not added when identifier is exported only once', async () => {
      // Code cell 1
      
      notebook.sharedModel.insertCell(0, {
        cell_type: 'code',
        source: 'a=9',
        metadata: {
          trusted: false
        }
      });
      
      let deletedCells: string[] = [];
      console.log('***************************************************************Cell 0 created, about to run cell');
      const cellModel = notebook.cells.get(0) as ICodeCellModel;
      const cell = new CodeCell({
        model: cellModel,
        rendermime: rendermime,
        contentFactory: contentFactory
      });
      //let result = await runNotebookCell(notebook, cellModel);
      const cellUUID =  notebook?.cells.get(0).sharedModel.id.replace(/-/g, '').substring(0, 8) || ''
      let dfData = getdfData(widget.model as DataflowNotebookModel, cellUUID)
      let result = await DataflowCodeCell.execute(
        cell as DataflowCodeCell,
        sessionContext,
        {
          deletedCells,
          recordTiming: false
        },
        dfData.dfMetadata,
        dfData.cellIdModelMap
      )
      console.log('*****************************RECIEVED RESULT ON EXECUtiON**********************************', result?.content);
      const content = (result?.content as any);  
      if (content) {
        const all_tags: { [key: string]: string } = {}
        for (let index = 0; index < notebook.cells.length; index++){
          const cAny = notebook.cells.get(index) as ICodeCellModel;
          if (cAny.type === 'code') {
            const cId = cAny.id.replace(/-/g, '').substring(0, 8);
            const dfmetadata = cAny.getMetadata('dfmetadata');
            if (dfmetadata && dfmetadata.tag){
              all_tags[cId] = dfmetadata.tag;
            }
          }
        }
      
        for (let index = 0; index < notebook.cells.length; index++){
          const cAny = notebook.cells.get(index) as ICodeCellModel;
          if (cAny.type === 'code') {
            const cId = cAny.id.replace(/-/g, '').substring(0, 8);
            const dfmetadata = cAny.getMetadata('dfmetadata');
            
            if(content.identifier_refs && content.identifier_refs[cId]){
              let inputVarsMetadata = { 'ref': {}, 'tag_refs': {}};
              let cellOutputTags: string[] = [];
              inputVarsMetadata.ref = content.identifier_refs[cId];
              
              let tag_refs: { [key: string]: string } = {}
              for (const ref_keys in content.identifier_refs[cId]){
                if(all_tags.hasOwnProperty(ref_keys)){
                  tag_refs[ref_keys] = all_tags[ref_keys];
                }
              }

              for (let i = 0; i < cAny.outputs.length; ++i) {
                const out = cAny.outputs.get(i);
                cellOutputTags.push(out.metadata['output_tag'] as string);
              }

              inputVarsMetadata.tag_refs = tag_refs;
              dfmetadata.inputVars = inputVarsMetadata;
              dfmetadata.outputVars = cellOutputTags;
              dfmetadata.persistentCode = cAny.sharedModel.getSource();
            }
            notebook.cells.get(index).setMetadata('dfmetadata', dfmetadata);
          }
        }
      }
      
      const commPromise = new Promise<void>(async (resolve) => {
        let comm = sessionContext.session?.kernel?.createComm('dfcode');
        if (comm) {
          comm.open();
          dfData = getdfData(widget.model as DataflowNotebookModel, '');
          if (!notebook.getMetadata('enable_tags')) {
            dfData.dfMetadata.input_tags = {};
          }

          comm.onMsg = (msg) => {
            console.log('***************COMM MSG REC************************************************', msg.content.data);
            const content = msg.content.data;
            if (content && content.code_dict && Object.keys(content.code_dict).length > 0) {
              for (let index = 0; index < notebook.cells.length; index++) {
                const cAny = notebook.cells.get(index) as ICodeCellModel;
                const cId = cAny.id.replace(/-/g, '').substring(0, 8);
                if (cAny.type === 'code' && content.code_dict.hasOwnProperty(cId)) {
                  let updatedCode = (content.code_dict as { [key: string]: any })[cId]
                  let dfmetadata = cAny.getMetadata('dfmetadata')
                  dfmetadata.persistentCode = updatedCode;
                  cAny.setMetadata('dfmetadata', dfmetadata);
                  cAny.sharedModel.setSource(updatedCode);
                }
              }
            }
            resolve(); // Resolve the promise when the message is received
          };


          comm.send({
            'dfMetadata': dfData.dfMetadata
          });

          console.log('***************COMM MSG SENT************************************************');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } else {
          resolve(); // Resolve immediately if comm is not created
        }
      });
      await commPromise; 


      console.log('***************************************************************COMM SERVICE RESOLVED');
      // verifies code cell execution
      let cAny = notebook?.cells.get(0) as ICodeCellModel;
      //expect(result).toBe(true);
      expect(cAny.outputs.length).toBe(1);
      expect(cAny.outputs.get(0).data['text/plain']).toBe('9');

      console.log('************************************************************************Cell 1 created, about to run cell');
      //Code cell 2
      // notebook.sharedModel.insertCell(1, {
      //   cell_type: 'code',
      //   source: 'b=a+9',
      //   metadata: {
      //     trusted: false
      //   }
      // });
  
      // cellModel = notebook?.cells.get(1) as ICodeCellModel;

      // result = await runNotebookCell(notebook, cellModel);
  
      // // verifies no ref UUID is added for identifier 'a' since it is exported only once
      // cAny = notebook?.cells.get(1) as ICodeCellModel;
      // expect(result).toBe(true);
      // expect(cAny.outputs.length).toBe(1);
      // expect(cAny.outputs.get(0).data['text/plain']).toBe('18');
      // expect(cAny.sharedModel.source).toBe('b=a+9');
    });
    
    
    // it('Reference UUID is not added when identifier is exported only once', async () => {
    //   // Code cell 1
    //   notebook.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
      
    //   console.log('***************************************************************Cell 0 created, about to run cell');
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
      
    //   // verifies code cell execution
    //   let cAny = notebook?.cells.get(0) as ICodeCellModel;
    //   expect(result).toBe(true);
    //   expect(cAny.outputs.length).toBe(1);
    //   expect(cAny.outputs.get(0).data['text/plain']).toBe('9');

    //   console.log('************************************************************************Cell 1 created, about to run cell');
    //   //Code cell 2
    //   notebook.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;

    //   result = await runNotebookCell(notebook, cellModel);
  
    //   // verifies no ref UUID is added for identifier 'a' since it is exported only once
    //   cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   expect(result).toBe(true);
    //   expect(cAny.outputs.length).toBe(1);
    //   expect(cAny.outputs.get(0).data['text/plain']).toBe('18');
    //   expect(cAny.sharedModel.source).toBe('b=a+9');
    // }, 120000);
  
    // it('Reference UUID is not removed when ambiguity exist', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'a=5\ntest=a+99\nb=a$'+refId+'+99',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
      
    //   let cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   expect(result).toBe(true);
    //   expect(cAny.outputs.length).toBe(1);
    //   expect(cAny.outputs.get(0).data['text/plain']).toBe('108');
    //   expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$'+refId+'+99');
    // });
  
    // it('Dfmetadata should be updated with references', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
  
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
  
    //   let cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   let dfmetadata = cAny.getMetadata("dfmetadata")
    //   expect(result).toBe(true);    
    //   expect(dfmetadata).toBeDefined();
    //   expect(dfmetadata.inputVars).toEqual({
    //     "ref": {
    //       [refId]: ["a"]
    //     },
    //     "tag_refs": {}
    //   });
    //   expect(dfmetadata.outputVars).toEqual(['b'])
    // });
  
    // it('Reference UUID is added when same identifier exported more than once', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
  
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
      
    //   //Code cell 3
    //   notebook?.sharedModel.insertCell(2, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(2) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
      
    //   let cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   expect(result).toBe(true);
    //   expect(cAny.sharedModel.source).toBe('b=a$'+refId+'+9');
    // });

    // it('When an identifier is exported multiple times and later reduced to one, the UUID is removed', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
  
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
      
    //   //Code cell 3
    //   notebook?.sharedModel.insertCell(2, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(2) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
      
    //   let cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   expect(result).toBe(true);
    //   expect(cAny.sharedModel.source).toBe('b=a$'+refId+'+9');

    //   //deleting code cell 2
    //   notebook.sharedModel.deleteCell(2)

    //   cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
    //   expect(cAny.sharedModel.source).toBe('b=a+9');
    // });
  
    // it('Reference UUID is added to identifier when its reference cell is deleted', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   expect(result).toBe(true);
  
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
  
    //   notebook.sharedModel.deleteCellRange(0,1);
      
    //   //Code cell 3
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'h=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
  
    //   let cAny = notebook?.cells.get(0) as ICodeCellModel;
    //   expect(result).toBe(true);
    //   expect(cAny.sharedModel.source).toBe('b=a$'+refId+'+9');
    // })
  
    // it('Reference UUID is added to identifier when its ref is removed by updating cell', async () => {
    //   // Code cell 1
    //   notebook?.sharedModel.insertCell(0, {
    //     cell_type: 'code',
    //     source: 'a=9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   let cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   let result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
  
    //   //Code cell 2
    //   notebook?.sharedModel.insertCell(1, {
    //     cell_type: 'code',
    //     source: 'b=a+9',
    //     metadata: {
    //       trusted: false
    //     }
    //   });
  
    //   cellModel = notebook?.cells.get(1) as ICodeCellModel;
    //   result = await runNotebookCell(notebook, cellModel);
    //   expect(result).toBe(true);
      
    //   //Running cell 1
    //   cellModel = notebook?.cells.get(0) as ICodeCellModel;
    //   cellModel.sharedModel.setSource('k=0');
    //   result = await runNotebookCell(notebook, cellModel);
  
    //   let cAny = notebook?.cells.get(1) as ICodeCellModel;
    //   const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
    //   expect(result).toBe(true);
    //   expect(cAny.sharedModel.source).toBe('b=a$'+refId+'+9');
    // })
  });

  // describe('Update references with Tags', () => {
  //   it('Should able to use tag as identifier ref', async () => {
  //     // Code cell 1
  //     notebook.setMetadata("enable_tags", true);
  //     notebook?.sharedModel.insertCell(0, {
  //       cell_type: 'code',
  //       source: 'a=9',
  //       metadata: {
  //         trusted: false
  //       }
  //     });

  //     let cellModel = notebook?.cells.get(0) as ICodeCellModel;
  //     let result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     let dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "Tag1";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 'a=5\ntest=a+99\nb=a$Tag1+99',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
      
  //     let cAny = notebook?.cells.get(1) as ICodeCellModel;
  //     expect(result).toBe(true);
  //     expect(cAny.outputs.length).toBe(1);
  //     expect(cAny.outputs.get(0).data['text/plain']).toBe('108');
  //     expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$Tag1+99');
  //   }, 60000);
  
  //   it('CellId should be replaced with tag in codecells when tag is added', async () => {
  //     // Code cell 1
  //     notebook.setMetadata("enable_tags", true);
  //     notebook?.sharedModel.insertCell(0, {
  //       cell_type: 'code',
  //       source: 'a=9',
  //       metadata: {
  //         trusted: false
  //       }
  //     });

  //     let cellModel = notebook?.cells.get(0) as ICodeCellModel;
  //     const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
  //     let result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 'a=5\ntest=a+99\nb=a$'+refId+'+99',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     let dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "Tag1";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     await updateNotebookCellsWithTag(notebook as DataflowNotebookModel, '', sessionContext)
      
  //     let cAny = notebook?.cells.get(1) as ICodeCellModel;
  //     expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$Tag1+99');
  //   });

  //   it('Dfmetadata should be updated with tag references', async () => {
  //     // Code cell 1
  //     notebook.setMetadata("enable_tags", true);
  //     notebook?.sharedModel.insertCell(0, {
  //       cell_type: 'code',
  //       source: 'a=9',
  //       metadata: {
  //         trusted: false
  //       }
  //     });

  //     let cellModel = notebook?.cells.get(0) as ICodeCellModel;
  //     let result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     let dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "Tag1";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 'a=5\ntest=a+99\nb=a$Tag1+99',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
      
  //     let cAny = notebook?.cells.get(1) as ICodeCellModel;
  //     const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
  //     dfmetadata = cAny.sharedModel.getMetadata('dfmetadata')
      
  //     expect(result).toBe(true);
  //     expect(cAny.outputs.length).toBe(1);
  //     expect(cAny.outputs.get(0).data['text/plain']).toBe('108');
  //     expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$Tag1+99');
  //     expect(dfmetadata).toBeDefined();
  //     expect(dfmetadata.inputVars).toEqual({
  //       "ref": {
  //         [refId]: ["a"]
  //       },
  //       "tag_refs": {
  //         [refId]: "Tag1"
  //       }
  //     });
  //   });
  
  //   it('Tag should be replaced with UUID when tag is removed', async () => {
  //     // Code cell 1
  //     notebook.setMetadata("enable_tags", true);
  //     notebook?.sharedModel.insertCell(0, {
  //       cell_type: 'code',
  //       source: 'a=9',
  //       metadata: {
  //         trusted: false
  //       }
  //     });

  //     let cellModel = notebook?.cells.get(0) as ICodeCellModel;
  //     let result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
  //     let dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "Tag1";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 'a=5\ntest=a+99\nb=a$Tag1+99',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     //deleting tag
  //     dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     await updateNotebookCellsWithTag(notebook as DataflowNotebookModel, refId, sessionContext)

  //     let cAny = notebook?.cells.get(1) as ICodeCellModel;
  //     expect(cAny.outputs.length).toBe(1);
  //     expect(cAny.outputs.get(0).data['text/plain']).toBe('108');
  //     expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$'+refId+'+99');
  //   })

  //   it('Tag should be replaced with UUID when tagged cell is deleted', async () => {
  //     // Code cell 1
  //     notebook.setMetadata("enable_tags", true);
  //     notebook?.sharedModel.insertCell(0, {
  //       cell_type: 'code',
  //       source: 'a=9',
  //       metadata: {
  //         trusted: false
  //       }
  //     });

  //     let cellModel = notebook?.cells.get(0) as ICodeCellModel;
  //     let result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     const refId = (notebook?.cells.get(0) as ICodeCellModel).id.replace(/-/g, '').substring(0, 8);
  //     let dfmetadata = (notebook?.cells.get(0) as ICodeCellModel).getMetadata('dfmetadata');
  //     dfmetadata.tag = "Tag1";
  //     notebook.cells.get(0).setMetadata('dfmetadata', dfmetadata);

  //     // Code cell 2
  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 'a=5\ntest=a+99\nb=a$Tag1+99',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);

  //     //deleting code cell 1
  //     notebook.sharedModel.deleteCellRange(0,1)

  //     // Code cell 3
  //     notebook?.sharedModel.insertCell(1, {
  //       cell_type: 'code',
  //       source: 's = "test"',
  //       metadata: {
  //         trusted: false
  //       }
  //     });
  
  //     cellModel = notebook?.cells.get(1) as ICodeCellModel;
  //     result = await runNotebookCell(notebook, cellModel);
  //     expect(result).toBe(true);
      
  //     let cAny = notebook?.cells.get(0) as ICodeCellModel;
  //     expect(cAny.sharedModel.source).toBe('a=5\ntest=a+99\nb=a$'+refId+'+99');
  //   })

  // });

});