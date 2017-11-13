package com.neotys.selenium.extras;

import javassist.util.proxy.MethodHandler;
import javassist.util.proxy.ProxyFactory;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedCondition;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.seleniumhq.selenium.fluent.FluentWebDriver;
import org.seleniumhq.selenium.fluent.FluentWebElement;
import org.seleniumhq.selenium.fluent.Period;

public class FluencyFactory {

    // create a fluent web driver that injects control visibility wait timing to overcome async DOM manipulation delays
    public static FluentWebDriver createFluentWebDriver(WebDriver delegate, int timeoutInSeconds)
    {
        // proxy the underlying FluentWebDriver object to inject method handlers
        ProxyFactory factory = new ProxyFactory();
        factory.setSuperclass(FluentWebDriver.class);
        factory.setFilter(method -> method.getReturnType().equals(FluentWebElement.class));

        Period timeoutPeriod = Period.secs(timeoutInSeconds);

        WebDriverWait wait = new WebDriverWait(delegate, timeoutInSeconds);

        MethodHandler handler = (self, thisMethod, proceed, args) -> {
            boolean attach = thisMethod.getReturnType().equals(FluentWebElement.class);

            // wait until messages from various frameworks have been processed (concept taken from Espresso fw)
            if(attach)
                waitForMessageQueueEmpty(wait);

            // invoke selector
            Object res = proceed.invoke(self, args);

            if(attach)
            {
                // before result is handed off, add critical waiting logic to fluent function chain
                FluentWebElement fel = ((FluentWebElement)res)
                        .within(timeoutPeriod)
                        .ifInvisibleWaitUpTo(Period.secs(5));
                WebElement el = fel.getWebElement();

                // make sure object is in current view, otherwise various browsers/versions don't like interaction
                ((JavascriptExecutor) delegate).executeScript("arguments[0].scrollIntoView(true);", el);

                res = fel;
            }
            return res;
        };


        try { // create proxy object with method injected and return
            return (FluentWebDriver) factory.create(new Class[]{ WebDriver.class }, new Object[] { delegate }, handler);
        } catch (Exception e) {
            e.printStackTrace();
            System.err.println(e.toString());
        }
        return null;
    }

    // method to wait for all unfinished DOM business
    static void waitForMessageQueueEmpty(WebDriverWait wait) {
        wait.until(documentReadyStateComplete());
        wait.until(jQueryAJAXCallsHaveCompleted());
        wait.until(angularPendingRequestsZero());
    }

    public static ExpectedCondition<Boolean> documentReadyStateComplete() {
        return driver -> { // wait for global document state to be loaded and ready
            JavascriptExecutor jse = (JavascriptExecutor)driver;
            String readyState = String.format("%s", jse.executeScript("return document ? document.readyState : null;"));
            System.out.println("Ready State => " + readyState);
            return readyState.equals("complete");
        };
    }

    public static ExpectedCondition<Boolean> jQueryAJAXCallsHaveCompleted() {
        // verify that, if jQuery, all async actions have been completed
        return driver -> (Boolean) ((JavascriptExecutor) driver).executeScript("return (window.jQuery ? (window.jQuery != null) && (jQuery.active === 0) : true);");
    }

    public static ExpectedCondition<Boolean> angularPendingRequestsZero() {
        // verify that, if Angular, all async actions have been completed
        return driver -> (Boolean) ((JavascriptExecutor) driver).executeScript("try { return (angular && (typeof angular === 'object' || typeof angular === 'function') ? (angular.element(document).injector().get('$http').pendingRequests.length === 0) : true); } catch(e) { console.log(e); return true; }");
    }

}
