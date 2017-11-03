package Selenium.utils;

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

import java.lang.reflect.Method;

public class FluencyFactory {

    public static FluentWebDriver createFluentWebDriver(WebDriver delegate, int timeoutInSeconds) {
        ProxyFactory factory = new ProxyFactory();
        factory.setSuperclass(FluentWebDriver.class);
        factory.setFilter(method -> method.getReturnType().equals(FluentWebElement.class));

        Period timeoutPeriod = Period.secs(timeoutInSeconds);

        WebDriverWait wait = new WebDriverWait(delegate, timeoutInSeconds);

        MethodHandler handler = (self, thisMethod, proceed, args) -> {
            boolean attach = thisMethod.getReturnType().equals(FluentWebElement.class);

            if(attach)
                waitForMessageQueueEmpty(wait);

            Object res = proceed.invoke(self, args);

            if(attach)
            {
                FluentWebElement fel = ((FluentWebElement)res)
                        .within(timeoutPeriod)
                        .ifInvisibleWaitUpTo(Period.secs(5));
                WebElement el = fel.getWebElement();
                ((JavascriptExecutor) delegate).executeScript("arguments[0].scrollIntoView(true);", el);

                res = fel;
            }
            return res;
        };


        try {
            return (FluentWebDriver) factory.create(new Class[]{ WebDriver.class }, new Object[] { delegate }, handler);
        } catch (Exception e) {
            e.printStackTrace();
            System.err.println(e.toString());
        }
        return null;
    }

    private static void waitForMessageQueueEmpty(WebDriverWait wait) {
        wait.until(documentReadyStateComplete());
        wait.until(jQueryAJAXCallsHaveCompleted());
        wait.until(angularPendingRequestsZero());
    }

    public static ExpectedCondition<Boolean> documentReadyStateComplete() {
        return driver -> {
            String readyState = ((JavascriptExecutor)driver).executeScript("return document.readyState").toString();
            System.out.println("Ready State => " + readyState);
            return readyState.equals("complete");
        };
    }

    public static ExpectedCondition<Boolean> jQueryAJAXCallsHaveCompleted() {
        return driver -> (Boolean) ((JavascriptExecutor) driver).executeScript("return (window.jQuery ? (window.jQuery != null) && (jQuery.active === 0) : true);");
    }

    public static ExpectedCondition<Boolean> angularPendingRequestsZero() {
        return driver -> (Boolean) ((JavascriptExecutor) driver).executeScript("return (angular ? (angular.element(document).injector().get('$http').pendingRequests.length === 0) : true);");
    }

}
