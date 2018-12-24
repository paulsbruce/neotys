#NeoLoad Custom Comparison Report
===================


This project provides an easy to use comparison report for NeoLoad Web data.

**To run via CLI:**

> npm install\
> node server.js --port 9099 --apikey=frWXnlgZE1RQM1KJ9BcDJNWp --host=your.neoload.server.com:8080 --ssl=false\
> curl "http://localhost:9099/api/comparison?baseline=31540bf2-dd77-40a5-a6eb-d239b66cde7d&candidate=563ff6ba-0e3c-46e4-abe4-747c6913c022"

**To run using Docker:**

> docker run -d -p 9099:9099 --name=neotys-extras paulsbruce/neotys-extras:latest\
> docker exec -it neotys-extras node /neotys/NLWCompare/server.js --port 9099 --apikey=... --host=...:8080\
> curl "http://localhost:9099/api/listProjects"

Please transpose your own API keys and NeoLoad Web host/IP spec before executing.
