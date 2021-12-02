import { Route, NavigationState } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import hoistNonReactStatics from "hoist-non-react-statics";
import * as React from "react";
import { View, StyleSheet, InteractionManager } from "react-native";
import { nodeFromRef } from "react-native-shared-element";

import { ISharedElementRendererData } from "./SharedElementRendererData";
import SharedElementSceneContext from "./SharedElementSceneContext";
import SharedElementSceneData from "./SharedElementSceneData";
import {
  SharedElementEventSubscription,
  SharedElementSceneComponent,
  SharedElementRoute,
  SharedElementsComponentConfig,
} from "./types";
import { EventEmitter } from "./utils/EventEmitter";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

type PropsType = {
  navigation: StackNavigationProp<any>;
  route: SharedElementRoute;
};

function isValidNavigationState(
  state: Partial<NavigationState>
): state is NavigationState {
  return "index" in state && "routes" in state;
}

// Gets the current screen from navigation state
function getActiveRoute(state: NavigationState): Route<any> {
  const route = state.routes[state.index];
  const routeState = route.state as Partial<NavigationState>;
  return route.state && isValidNavigationState(routeState)
    ? getActiveRoute(routeState) // Dive into nested navigators
    : route;
}

function isActiveRoute(
  navigation: StackNavigationProp<any>,
  route: Route<any>
): boolean {
  // @ts-ignore: getState is supported by navigation 6
  const state: NavigationState = navigation.getState
    ? // @ts-ignore: getState is supported by navigation 6
      navigation.getState()
    : // @ts-ignore: dangerouslyGetState is provided for navigation 5 compatibility
      navigation.dangerouslyGetState();
  const activeRoute = getActiveRoute(state);
  return route.name === activeRoute.name;
}

function createSharedElementScene(config: {
  Component: SharedElementSceneComponent;
  sharedElements: SharedElementsComponentConfig | void;
  rendererData: ISharedElementRendererData;
  emitter: EventEmitter;
  CaptureProgressComponent: React.ComponentType<{
    sceneData: SharedElementSceneData;
  }>;
  navigatorId: string;
  verbose: boolean;
  isNativeNavigator?: boolean;
}): React.ComponentType<any> {
  const {
    Component,
    sharedElements,
    rendererData,
    emitter,
    CaptureProgressComponent,
    navigatorId,
    verbose,
    isNativeNavigator,
  } = config;

  class SharedElementSceneView extends React.PureComponent<PropsType> {
    private subscriptions: {
      [key: string]: SharedElementEventSubscription;
    } = {};
    private sceneData: SharedElementSceneData = new SharedElementSceneData(
      Component,
      () => sharedElements || Component.sharedElements,
      this.props.route,
      navigatorId,
      rendererData.nestingDepth,
      verbose,
      isNativeNavigator ?? false,
      rendererData
    );

    static readonly config = config;

    componentDidMount() {
      const { navigation } = this.props;
      this.subscriptions = {
        willFocus: emitter.addListener("focus", this.onWillFocus),
        willBlur: emitter.addListener("blur", this.onWillBlur),
        transitionStart: navigation.addListener(
          "transitionStart",
          this.onTransitionStart
        ),
        transitionEnd: navigation.addListener(
          "transitionEnd",
          this.onTransitionEnd
        ),
      };
    }

    private onTransitionStart = ({ data: { closing } }: any) => {
      rendererData.updateSceneState(
        closing ? "startClosingTransition" : "startOpenTransition",
        this.sceneData
      );
    };

    private onTransitionEnd = ({ data: { closing } }: any) => {
      rendererData.updateSceneState(
        closing ? "endClosingTransition" : "endOpenTransition",
        this.sceneData
      );
      if (isNativeNavigator) {
        //console.log("onDidFocus: ", this.props.route);
        if (this.sceneData.updateRoute(this.props.route)) {
          rendererData.updateSceneState("didFocus", this.sceneData);
        }
      }
    };

    componentWillUnmount() {
      Object.values(this.subscriptions).forEach((unsubscribe) => unsubscribe());
    }

    render() {
      // console.log('SharedElementSceneView.render');
      return (
        <SharedElementSceneContext.Provider value={this.sceneData}>
          <View
            style={styles.container}
            collapsable={false}
            ref={this.onSetRef}
          >
            <CaptureProgressComponent sceneData={this.sceneData} />
            <Component {...this.props} />
          </View>
        </SharedElementSceneContext.Provider>
      );
    }

    componentDidUpdate() {
      this.sceneData.updateRoute(this.props.route);
    }

    private onSetRef = (ref: any) => {
      this.sceneData.setAncestor(nodeFromRef(ref));
    };

    private onWillFocus = () => {
      const { navigation, route } = this.props;

      //console.log("onWillFocus: ", route);
      if (isActiveRoute(navigation, route)) {
        this.sceneData.updateRoute(route);
        rendererData.updateSceneState("willFocus", this.sceneData);
        if (!isNativeNavigator) {
          InteractionManager.runAfterInteractions(() => {
            //console.log("onDidFocus: ", this.props.route);
            this.sceneData.updateRoute(this.props.route);
            rendererData.updateSceneState("didFocus", this.sceneData);
          });
        }
      }
    };

    private onWillBlur = () => {
      const { navigation, route } = this.props;

      // console.log("onWillBlur: ", route);
      if (!isActiveRoute(navigation, route)) {
        this.sceneData.updateRoute(route);
        rendererData.updateSceneState("willBlur", this.sceneData);
        /*if (!isNativeNavigator) {
          InteractionManager.runAfterInteractions(() => {
            //console.log("onDidBlur: ", this.props.route);
            this.sceneData.updateRoute(this.props.route);
            rendererData.updateSceneState("didBlur", this.sceneData);
          });
        }*/
      }
    };
  }

  hoistNonReactStatics(SharedElementSceneView, Component);
  return SharedElementSceneView;
}

export default createSharedElementScene;
