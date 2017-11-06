package Selenium.utils;

import com.neotys.selenium.extras.FluentNLWebDriver;
import com.neotys.selenium.proxies.NLWebDriver;
import org.openqa.selenium.WebDriver;

// this class is where your custom harness and other globally useful test functionality should go
public class MyCustomWebDriver extends FluentNLWebDriver {

    private MyCustomWebDriver(FluentNLWebDriver delegate) {
        super(delegate);
    }

    public static MyCustomWebDriver newDriver(String userPath) {
        // provides opportunity for custom pre-initialization activities
        return new MyCustomWebDriver(FluentNLWebDriver.newDriver(null, userPath));
    }

}
