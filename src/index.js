/* @flow */

import fromEventsWithOptions from './lib/fromEventsWithOptions';
import Kefir from 'kefir';
import kefirBus from 'kefir-bus';
import type {Bus} from 'kefir-bus';
import React from 'react';
import {createPortal} from 'react-dom';
import PropTypes from 'prop-types';
import containByScreen from 'contain-by-screen';
import type {Options} from 'contain-by-screen';
import isEqual from 'lodash/isEqual';

const requestAnimationFrame = global.requestAnimationFrame || (cb => Promise.resolve().then(cb));

type FloatAnchorContextType = {
  repositionEvents: Kefir.Observable<null>;
};

// Context is used so that when a FloatAnchor has reposition() called on it,
// all of its descendant FloatAnchor elements reposition too.
const FloatAnchorContext = React.createContext<?FloatAnchorContextType>(null);

export type {Options} from 'contain-by-screen';

export type Props = {
  anchor: (anchorRef: React$Ref<any>) => React$Node;
  float?: ?React$Node;
  options?: ?Options;
  zIndex?: ?number|string;
  floatContainerClassName?: ?string;
};
export default class FloatAnchor extends React.Component<Props> {
  static propTypes = {
    anchor: PropTypes.func.isRequired,
    float: PropTypes.node,
    options: PropTypes.object,
    zIndex: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    floatContainerClassName: PropTypes.string
  };

  static contextType = FloatAnchorContext;

  _portalEl: ?HTMLElement;
  _portalRemoval: Bus<null> = kefirBus();
  _unmount: Bus<null> = kefirBus();
  _repositionEvents: Bus<null> = kefirBus();
  _childContext: FloatAnchorContextType = {
    repositionEvents: this._repositionEvents
  };

  _anchorRef: ?HTMLElement = null;

  static *parentNodes(node: Node): Iterator<Node> {
    do {
      yield (node: Node);
    } while ((node = (node: any).rfaAnchor || (node: any).parentNode));
  }

  _setAnchorRef = (anchorRef: ?HTMLElement) => {
    this._anchorRef = anchorRef;

    const portalEl = this._portalEl;
    if (portalEl) {
      if (anchorRef) {
        (portalEl: any).rfaAnchor = anchorRef;
      } else {
        delete (portalEl: any).rfaAnchor;
      }
    }
  };

  _getOrCreatePortalEl(): HTMLElement {
    let portalEl = this._portalEl;
    if (portalEl) {
      return portalEl;
    }
    portalEl = this._portalEl = document.createElement('div');
    portalEl.className = this.props.floatContainerClassName || '';
    portalEl.style.zIndex = String(this.props.zIndex);
    portalEl.style.position = 'fixed';

    return portalEl;
  }

  componentDidMount() {
    this._updateFloat();
    const parentCtx: ?FloatAnchorContextType = this.context;
    if (parentCtx) {
      parentCtx.repositionEvents
        .takeUntilBy(this._unmount)
        .onValue(() => this.reposition());
    }
    // We need to reposition after the page has had its layout done.
    requestAnimationFrame(() => {
      this.reposition();
    });
  }

  componentDidUpdate(prevProps: Props) {
    const portalEl = this._portalEl;
    if (portalEl) {
      if (prevProps.floatContainerClassName !== this.props.floatContainerClassName) {
        portalEl.className = this.props.floatContainerClassName || '';
      }
      if (prevProps.zIndex !== this.props.zIndex) {
        portalEl.style.zIndex = String(this.props.zIndex);
      }
    }

    if (
      prevProps.float !== this.props.float
    ) {
      this._updateFloat();
      this.reposition();
    } else if (!isEqual(prevProps.options, this.props.options)) {
      this.reposition();
    }
  }

  componentWillUnmount() {
    this._portalRemoval.emit(null);
    this._unmount.emit(null);
    this._repositionEvents.end();
  }

  _updateFloat() {
    const {float} = this.props;
    const portalEl = this._portalEl;

    if (float) {
      if (!portalEl) throw new Error('Should not happen: portalEl not initialized');

      if (!portalEl.parentElement) {
        const anchorRef = this._anchorRef;
        if (!anchorRef) throw new Error('ReactFloatAnchor missing anchorRef element');
        const target = document.body || document.documentElement;
        if (!target) throw new Error('Could not find element to attach portal to');
        target.appendChild(portalEl);
        (portalEl: any).rfaAnchor = anchorRef;
        this._portalRemoval.take(1).onValue(() => {
          (portalEl: any).rfaAnchor = undefined;
          if (portalEl.parentElement) portalEl.parentElement.removeChild(portalEl);
        });
        Kefir.merge([
          Kefir.fromEvents(window, 'resize'),
          fromEventsWithOptions(window, 'scroll', {capture: true, passive: true})
            .filter(event => event.target.contains(anchorRef))
        ])
          .takeUntilBy(this._portalRemoval)
          .onValue(() => {
            this.reposition();
          });
      }
    } else {
      if (portalEl && portalEl.parentElement) {
        this._portalRemoval.emit(null);
      }
    }
  }

  reposition() {
    const portalEl = this._portalEl;
    const anchorRef = this._anchorRef;
    if (portalEl && portalEl.parentElement && anchorRef) {
      containByScreen(portalEl, anchorRef, this.props.options || {});

      // Make any child FloatAnchors reposition
      this._repositionEvents.emit(null);
    }
  }

  render() {
    const {anchor, float} = this.props;
    let floatPortal = null;
    if (float != null) {
      const portalEl = this._getOrCreatePortalEl();
      floatPortal = (
        <FloatAnchorContext.Provider value={this._childContext}>
          {createPortal(float, portalEl)}
        </FloatAnchorContext.Provider>
      );
    }

    return (
      <>
        {anchor((this._setAnchorRef: any))}
        {floatPortal}
      </>
    );
  }
}
