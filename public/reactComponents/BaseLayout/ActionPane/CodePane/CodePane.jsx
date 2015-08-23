import React from 'react';
import UpdateStore from '../../../../modules/stores/UpdateStore.js';

// made my own modifications to this and added to open source on GitHub
import AceEditor from '../../../../modules/vendor/react-ace/index.js';
let brace = require('brace');
require('brace/mode/javascript');
require('brace/theme/solarized_dark');


/* Interface between React and Ace Editor:
   subscriptions to codeupdating via the UpdateStore
   change the underlying Ace Editor state directly and 
   so don't trigger React re-rendering */

class CodePane {

  static propTypes = {
    codeString: React.PropTypes.string,
    options: React.PropTypes.object,
  }


  static defaultProps = {
    options: {
      theme: 'solarized_dark',
      mode: 'javascript',
      height: '800px',
      width: '100%',
      fontSize: 18,
      cursorStart: 1,
      editorProps: {
        $blockScrolling: Infinity,
      },
    },
  }

  componentDidMount = () => {
    UpdateStore.subscribeListener(this.onUpdate);
  }

  componentWillUnmount() {
    UpdateStore.unsubscribeListener(this.onUpdate);
  }

  onUpdate = () => {
    let editor = this.refs.aceEditor.editor;
    let execCode = UpdateStore.getState().execCode;
    if (execCode && editor.getValue() !== execCode) {
      editor.setValue(execCode, 1);
    }
    let execCodeLine = UpdateStore.getState().execCodeLine;
    let range = editor.find(execCodeLine);
    if (!range) {
      /* backup selection due to potential of escodegen not rebuilding
         the exact same code string: selects whole row only.
         (loc selection info in node doesn't work due to indenting
          in editor) */
      range = UpdateStore.getState().range.collapseRows();
    }
    this.refs.aceEditor.editor.selection.setSelectionRange(range);
  }

  render() {
    let {...other
    } = this.props.options;
    return (
      <div className="flex-code-pane">
        <AceEditor ref={'aceEditor'}
        name="aceEditor"
          value={this.props.codeString}
          {...other} />
      </div>
    );
  }

}


export default CodePane;