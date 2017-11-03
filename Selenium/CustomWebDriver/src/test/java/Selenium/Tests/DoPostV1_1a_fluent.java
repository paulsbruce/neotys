package Selenium.Tests;

import Selenium.utils.*;
import org.seleniumhq.selenium.fluent.FluentWebDriver;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.experimental.categories.Category;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import static org.openqa.selenium.By.*;

import java.io.File;

/**********************************************************************************************************************/
/**  THIS TEST INCLUDES NEW FUNCTIONALITY TO SHOW HOW NEOLOAD RETAINS SETTINGS AND SCRIPTING FROM A PRIOR USER PATH  **/
/**********************************************************************************************************************/

@Category({FunctionalTests.class, PerformanceTests.class})
public class DoPostV1_1a_fluent {

    static CompositeWebDriver driver;
    static String baseUrl;
    static String imgPath;

    @BeforeClass
    public static void before() {

        driver = CompositeWebDriver.newDriver("Post1_1"); // equivalent to NLWebDriverFactory.newNLWebDriver(baseDriver, nlUserPath, nlProjectPath);

        baseUrl = driver.getSetting("baseUrl", "http://ushahidi");

        imgPath = driver.getSetting("img", CompositeWebDriver.WORKING_DIR + File.separator +  "Sea.jpg");
    }

    @Test
    public void testPost() throws Exception {

        // addingimage upload functionality in

        FluentWebDriver f = driver.fluent();

        driver.get(baseUrl + "/views/map");

        f.button(className("button-alpha button-fab"))
                .click();

        f.elements(className("bug"))
                .filter(driver.textContains("v1.2"))
                .click();

        f.input(id("title"))
                .clearField()
                .sendKeys("test");

        f.textarea(id("content"))
                .clearField()
                .sendKeys("this is a test");

        f.select(name("values_21"))
                .selectByVisibleText("Wild Fire");

        f.input(By.cssSelector("input[name='values_22']"))
                .clearField()
                .sendKeys("Boston")
                .sendKeys(Keys.ENTER);

        if(true) { // v1.2 major difference in functional change
            f.element(By.id("values_23"))
                    .clearField()
                    .sendKeys(imgPath);
        }

        driver.sleep(1000);
        driver.findElement(By.xpath("(//button[@type='submit'])[2]"))
                .click();
        driver.sleep(1000);

        f.link(className("view-map"))
                .click();
    }

    @AfterClass
    public static void after() {
        if (driver != null) {
            driver.quit();
        }
    }

}