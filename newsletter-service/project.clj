(defproject newsletter-service "0.1.0"
  :description "Mikroserwis newslettera — Café JaKi"
  :dependencies [[org.clojure/clojure       "1.11.1"]
                 [ring/ring-jetty-adapter    "1.11.0"]
                 [ring/ring-core             "1.11.0"]
                 [ring/ring-json             "0.5.1"]
                 [compojure                  "1.7.1"]
                 [clj-http                   "3.12.3"]
                 [cheshire                   "5.13.0"]
                 [ring-cors                  "0.1.13"]]
  :main newsletter-service.core
  :aot  [newsletter-service.core])
