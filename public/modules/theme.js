//Set up React Material UI with Dark theme
import mui from 'material-ui';
let themeManager = new mui.Styles.ThemeManager();
themeManager.setTheme(themeManager.types.DARK);

export default class OuterMostParentComponent extends React.Component {
    getChildContext() {
        return {
            muiTheme: ThemeManager.getCurrentTheme()
        };
    }
};

OuterMostParentComponent.childContextTypes = {
    muiTheme: React.PropTypes.object
};
