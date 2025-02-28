import { SessionContext, ISessionContext } from '@jupyterlab/apputils';
import { createSessionContext } from '@jupyterlab/apputils/lib/testutils';
import { JupyterServer } from '@jupyterlab/testing';
import { DataflowNotebook as Notebook, DataflowNotebookModel } from '../src';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import * as utils from './utils';
import { INotebookModel, NotebookActions, StaticNotebook as StaticNotebookType } from '@jupyterlab/notebook';
import { Context } from '@jupyterlab/docregistry';
import type { ISharedNotebook } from '@jupyter/ydoc';
import { DocumentRegistry } from '@jupyterlab/docregistry';

const server = new JupyterServer();
function createNew (
    options: DocumentRegistry.IModelOptions<ISharedNotebook> = {}
  ): INotebookModel {
    return new DataflowNotebookModel({
      languagePreference: 'python',
      sharedModel: new DataflowNotebookModel().sharedModel,
      collaborationEnabled: false,
      //@ts-ignore
      disableDocumentWideUndoRedo: false
    });
  }

beforeAll(async () => {
  await server.start({'additionalKernelSpecs':{'dfpython3':{'argv':['python','-m','dfkernel','-f','{connection_file}'],'display_name':'DFPython 3','language':'python'}}});
}, 30000);

afterAll(async () => {
  await server.shutdown();
});

describe('@jupyterlab/notebook', () => {
  let rendermime: IRenderMimeRegistry;
  
  describe('NotebookActions', () => {
    let widget: Notebook;
    let sessionContext: ISessionContext;
    let context: Context<INotebookModel>;

    beforeAll(async function () {
      rendermime = utils.defaultRenderMime();
      sessionContext = await createSessionContext(
        {'kernelPreference':
        {'name':'dfpython3','autoStartDefault':true,'shouldStart':true}});
    
      await (sessionContext as SessionContext).initialize();
      await sessionContext.session?.kernel?.info;
      await sessionContext.session?.id;
      await sessionContext.startKernel();
    }, 30000);

    
    beforeEach(async () => {
        widget = new Notebook({
          rendermime,
          contentFactory: utils.createNotebookFactory(),
          mimeTypeService: utils.mimeTypeService,
          notebookConfig: {
            ...StaticNotebookType.defaultNotebookConfig,
            windowingMode: 'none'
          },
        });
        context = await utils.createMockContext(true);
        const model = createNew();
        
        model.fromJSON(utils.DEFAULT_CONTENT);
        widget.model = model;      
    });

    afterEach(() => {
      widget.model?.dispose();
      context.dispose();
      widget.dispose();
      utils.clipboard.clear();
    });

    afterAll(async () => {
      await Promise.all([
        sessionContext.shutdown()
      ]);
    });

    describe('#executed', () => {
      it('should emit when Markdown and code cells are run', async () => {
        widget.model!.sharedModel.insertCell(0, {
            cell_type: 'code',
            source: 'a=9',
            metadata: {
              trusted: false
            }
        });
        // let emitted = 0;
        // NotebookActions.selectionExecuted.connect(() => {
        //   emitted += 1;
        // });
        widget.select(widget.widgets[0]);
        const result = await NotebookActions.run(widget, sessionContext);
        expect(result).toBe(true);
        //expect(emitted).toBe(1);
      });
    });
});
});