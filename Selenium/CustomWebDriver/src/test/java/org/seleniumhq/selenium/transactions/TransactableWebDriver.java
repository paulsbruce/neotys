package org.seleniumhq.selenium.transactions;

import org.apache.commons.lang.StringUtils;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.events.EventFiringWebDriver;
import org.openqa.selenium.support.events.WebDriverEventListener;

import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class TransactableWebDriver implements WebDriver, WebDriverEventListener {

    private WebDriver underlyingDriver = null;
    private ArrayList<TransactionListener> listeners = new ArrayList<>();

    public TransactableWebDriver(WebDriver delegate) {
        EventFiringWebDriver firing = new EventFiringWebDriver(delegate);
        underlyingDriver = firing;
        firing.register(this);
    }

    public void addTransactionListener(TransactionListener listener) {
        listeners.add(listener);
    }
    public void removeTransactionListener(TransactionListener listener) {
        listeners.remove(listener);
    }

    private boolean isManagedTransaction = false;
    private WebDriverTransaction lastTransaction = null;

    public void startTransaction(WebDriverTransaction transaction, Runnable fSteps) {
        isManagedTransaction = true;
        _startTransaction(transaction, fSteps);
    }
    private void _startTransaction(WebDriverTransaction transaction, Runnable fSteps) {

        if(lastTransaction != null)
            finalizeTransaction(); // opportunistic finalization

        // flip transaction over
        lastTransaction = transaction;

        listeners.forEach(listener -> listener.transactionStarted(transaction));

        // [vis.1] start listener for next dom-ready render event, intercept to take document screenshot, and associate with transaction
        // [vis.2] perform steps if scoped with a lambda
        if(fSteps != null) {
            fSteps.run();
            finalizeTransaction(); // deterministic finalization
        }

    }
    public void startTransaction(WebDriverTransaction transaction) {
        startTransaction(transaction, null);
    }
    public void startTransaction(String transactionName) { startTransaction((new WebDriverTransaction(transactionName)), null); }
    public void startTransaction(String transactionName, Runnable fSteps) { startTransaction((new WebDriverTransaction(transactionName)), fSteps); }

    private void finalizeTransaction() {
        if(lastTransaction != null) {

            // 1.
            // [vis.3] take a new document screenshot of final transaction state, diff the two screenshots to highlight changes, and update transaction

            WebDriverTransaction lt = lastTransaction;
            lastTransaction = null; // manage internal state first
            listeners.forEach(listener -> listener.transactionFinished(lt));
        }
        isManagedTransaction = false;
    }

    private void _beforeInternalEvent(String eventDescription) {
        if(isManagedTransaction) return;
        _startTransaction(new WebDriverTransaction(eventDescription), null);
    }


    @Override
    public void get(String url) {
        _beforeInternalEvent("get: "+url);
        underlyingDriver.get(url);
    }

    @Override
    public String getCurrentUrl() {
        return underlyingDriver.getCurrentUrl();
    }

    @Override
    public String getTitle() {
        return underlyingDriver.getTitle();
    }

    @Override
    public List<WebElement> findElements(By by) {
        return underlyingDriver.findElements(by);
    }

    @Override
    public WebElement findElement(By by) {
        return underlyingDriver.findElement(by);
    }

    @Override
    public String getPageSource() {
        return underlyingDriver.getPageSource();
    }

    @Override
    public void close() {
        finalizeTransaction();
        underlyingDriver.close();
    }

    @Override
    public void quit() {
        finalizeTransaction();
        underlyingDriver.quit();
    }

    @Override
    public Set<String> getWindowHandles() {
        return underlyingDriver.getWindowHandles();
    }

    @Override
    public String getWindowHandle() {
        return underlyingDriver.getWindowHandle();
    }

    @Override
    public TargetLocator switchTo() {
        _beforeInternalEvent("switchTo");
        return underlyingDriver.switchTo();
    }

    @Override
    public Navigation navigate() {
        _beforeInternalEvent("navigate");
        return underlyingDriver.navigate();
    }

    @Override
    public Options manage() {
        return underlyingDriver.manage();
    }



    @Override
    public void beforeAlertAccept(WebDriver driver) {

    }

    @Override
    public void afterAlertAccept(WebDriver driver) {

    }

    @Override
    public void afterAlertDismiss(WebDriver driver) {

    }

    @Override
    public void beforeAlertDismiss(WebDriver driver) {

    }

    @Override
    public void beforeNavigateTo(String url, WebDriver driver) {
        String path = url;
        try {
            URL u = new URL(url);
            path = u.getPath();
        } catch(MalformedURLException e) {
        }
        _beforeInternalEvent("Navigate To: " + path);
        // set a flag to wait around until page loads...
    }

    @Override
    public void afterNavigateTo(String url, WebDriver driver) {
        // look at page title and rewrite last transaction name
    }

    @Override
    public void beforeNavigateBack(WebDriver driver) {
        _beforeInternalEvent("Navigate Back");
    }

    @Override
    public void afterNavigateBack(WebDriver driver) {

    }

    @Override
    public void beforeNavigateForward(WebDriver driver) {
        _beforeInternalEvent("Navigate Forward");
    }

    @Override
    public void afterNavigateForward(WebDriver driver) {
    }

    @Override
    public void beforeNavigateRefresh(WebDriver driver) {
        _beforeInternalEvent("beforeNavigateRefresh");
    }

    @Override
    public void afterNavigateRefresh(WebDriver driver) {

    }

    @Override
    public void beforeFindBy(By by, WebElement element, WebDriver driver) {

    }

    @Override
    public void afterFindBy(By by, WebElement element, WebDriver driver) {

    }

    @Override
    public void beforeClickOn(WebElement element, WebDriver driver) {
        String identity = null;
        WebElement cur = element;
        for(int i=0; i<7 && cur != null; i++) {
            identity = cur.getAttribute("id");
            if (isNoString(identity)) identity = cur.getAttribute("name");
            if (isNoString(identity)) identity = cur.getAttribute("title");
            if (isNoString(identity)) identity = cur.getText();
            if (isNoString(identity)) identity = cur.getTagName();
            if (isNoString(identity))
                cur = cur.findElement(By.xpath("./.."));
            else
                break;
        }
        if (isNoString(identity)) identity = "obj:"+element.getLocation().toString();
        // eventually compute smartest xpath
        _beforeInternalEvent("Click: " + identity);
    }

    private static boolean isNoString(String s) {
        return !(s != null && !StringUtils.isEmpty(s) && !StringUtils.isBlank(s));
    }

    @Override
    public void afterClickOn(WebElement element, WebDriver driver) {

    }

    @Override
    public void beforeChangeValueOf(WebElement element, WebDriver driver, CharSequence[] keysToSend) {

    }

    @Override
    public void afterChangeValueOf(WebElement element, WebDriver driver, CharSequence[] keysToSend) {

    }

    @Override
    public void beforeScript(String script, WebDriver driver) {

    }

    @Override
    public void afterScript(String script, WebDriver driver) {

    }

    @Override
    public void onException(Throwable throwable, WebDriver driver) {

    }
}
