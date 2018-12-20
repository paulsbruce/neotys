#NeoLoad Demos
===================


Welcome! This repository houses examples of how to use NeoLoad in a number of contexts.

**Docker:**

Some of these custom tools are automatically packaged up as Docker images, available at
 https://cloud.docker.com/u/paulsbruce/repository/docker/paulsbruce/neotys-extras

This images tails /dev/null to stay alive, so please RUN detached using the following command:

> docker run -d --name=neotys-extras paulsbruce/neotys-extras:latest

To then run one of the various packages included, for example the Custom Comparison Report utility,
 it is recommended to launch as a separate exec process, as follows:

> docker exec -it neotys-extras node /neotys/NLWCompare/server.js --port 9099 --apikey=... --host=...:8080

This allows you to run components either as a shared container between builds or
 independently as part of each build pipeline that requires the extras.


----------


----------
