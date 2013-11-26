/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function isBrowserWindow(window)
{
  return ("gBrowser" in window) && ("browsers" in window.gBrowser);
}

let {Prefs} = require("prefs");
Prefs.addListener(function(name)
{
  if (name == "ignorePinned")
  {
    // Re-check all pinned tabs in all windows
    let enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements())
    {
      let window = enumerator.getNext().QueryInterface(Ci.nsIDOMWindow);
      if (!isBrowserWindow(window))
        return;

      let tabs = window.gBrowser.tabs;
      for (let i = 0; i < tabs.length; i++)
        if (tabs[i].pinned)
          onTabModified({target: tabs[i], type: "TabAttrModified"});
    }
  }
});

let {WindowObserver} = require("windowObserver");
new WindowObserver({
  applyToWindow: function(window)
  {
    if (!isBrowserWindow(window))
      return;

    let browsers = window.gBrowser.browsers;
    for (let i = 0; i < browsers.length; i++)
      suspendBrowser(browsers[i], browsers[i] != window.gBrowser.selectedBrowser);

    window.gBrowser.tabContainer.addEventListener("TabOpen", onTabModified, false);
    window.gBrowser.tabContainer.addEventListener("TabClose", onTabModified, false);
    window.gBrowser.tabContainer.addEventListener("TabAttrModified", onTabModified, false);
    window.gBrowser.tabContainer.addEventListener("TabPinned", onTabModified, false);
    window.gBrowser.tabContainer.addEventListener("TabUnpinned", onTabModified, false);
  },

  removeFromWindow: function(window)
  {
    if (!isBrowserWindow(window))
      return;

    let browsers = window.gBrowser.browsers;
    for (let i = 0; i < browsers.length; i++)
      suspendBrowser(browsers[i], false);

    window.gBrowser.tabContainer.removeEventListener("TabOpen", onTabModified, false);
    window.gBrowser.tabContainer.removeEventListener("TabClose", onTabModified, false);
    window.gBrowser.tabContainer.removeEventListener("TabAttrModified", onTabModified, false);
    window.gBrowser.tabContainer.removeEventListener("TabPinned", onTabModified, false);
    window.gBrowser.tabContainer.removeEventListener("TabUnpinned", onTabModified, false);
  }
});

let Observer =
{
  topic : "content-document-global-created",

  init: function()
  {
    Services.obs.addObserver(this, this.topic, true);
    onShutdown.add(function() {
      Services.obs.removeObserver(this, this.topic);
    }.bind(this));
  },

  observe: function(subject, topic, data)
  {
    if (topic != this.topic || !(subject instanceof Ci.nsIDOMWindow))
      return;

    // We need top-level windows only
    if (subject.parent != subject)
      return;

    // Try to get the <browser> element for that window
    let window = subject.QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIWebNavigation)
                        .QueryInterface(Ci.nsIDocShellTreeItem)
                        .rootTreeItem
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindow);
    if (window.document.readyState != "complete" || !isBrowserWindow(window))
      return;

    let browser = window.gBrowser.getBrowserForDocument(subject.document);
    if (!browser || !("__sbtSuspended" in browser))
      return;

    // New document loaded into a suspended tab, suspend it
    suspendBrowser(browser, true, true);
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference])
};
Observer.init();

function shouldSuspendTab(window, tab)
{
  if (tab == window.gBrowser.selectedTab)
    return false;

  if (Prefs.ignorePinned && tab.pinned)
    return false;

  return true;
}

function onTabModified(event)
{
  let tab = event.target;
  let window = tab.ownerDocument.defaultView;
  suspendBrowser(window.gBrowser.getBrowserForTab(tab), event.type != "TabClose" && shouldSuspendTab(window, tab));
}

function suspendBrowser(browser, suspend, force)
{
  if (!force && ("__sbtSuspended" in browser) == suspend)
    return;   // Nothing to do

  let utils = browser.contentWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                     .getInterface(Components.interfaces.nsIDOMWindowUtils);
  if (suspend)
  {
    utils.suppressEventHandling(true);
    utils.suspendTimeouts();
    browser.__sbtSuspended = true;
  }
  else
  {
    utils.suppressEventHandling(false);
    utils.resumeTimeouts();
    delete browser.__sbtSuspended;
  }
}

