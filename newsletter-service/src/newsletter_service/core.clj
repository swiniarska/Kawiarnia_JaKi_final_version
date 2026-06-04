(ns newsletter-service.core
  (:require [compojure.core       :refer [defroutes POST OPTIONS]]
            [compojure.route      :as route]
            [ring.adapter.jetty   :refer [run-jetty]]
            [ring.middleware.json :refer [wrap-json-body]]
            [ring.middleware.cors :refer [wrap-cors]]
            [clj-http.client      :as http]
            [cheshire.core        :as json])
  (:gen-class))

;; Klucz API Resend - uzyskany z resend.com/dashboard
(def resend-api-key "re_Euxceqpk_M38z6mmvMZvRNHSYLLqWxxGD")

;; Email kawiarni - Resend na darmowym planie wysyla TYLKO na ten adres
;; Gdy ktos zapisze sie na newsletter, kawiarnia dostaje powiadomienie z jego emailem
(def email-kawiarni "caffeejaki@gmail.com")

;; Sprawdza czy podany string to poprawny adres email
(defn poprawny-email? [email]
  (and (string? email)
       (re-matches #"^[^\s@]+@[^\s@]+\.[^\s@]+$" email)))

;; Buduje tresc emaila powiadomienia dla kawiarni
;; Wlasciciel dowiaduje sie kto zapisal sie na newsletter
(defn html-powiadomienie [email-subskrybenta]
  (str
    "<div style='font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb'>"
    "<div style='background:#102C26;padding:32px 40px'>"
    "<h1 style='color:#F7E7CE;font-family:Georgia,serif;font-size:26px;font-weight:300;margin:0'>Cafe JaKi</h1>"
    "<p style='color:#C9A96E;font-size:10px;letter-spacing:.3em;text-transform:uppercase;margin:6px 0 0'>Nowy subskrybent newslettera</p>"
    "</div>"
    "<div style='padding:36px 40px;background:#FDFAF6'>"
    "<p style='font-family:Georgia,serif;font-size:24px;font-weight:300;color:#102C26;margin:0 0 16px'>Nowa osoba zapisala sie na newsletter!</p>"
    "<p style='font-size:13px;color:#6b7c6f;line-height:1.9;margin:0 0 8px'>Adres email subskrybenta:</p>"
    "<p style='font-size:16px;font-weight:500;color:#102C26;background:#F7E7CE;padding:12px 18px;border-radius:4px;display:inline-block;margin:0 0 24px'>"
    email-subskrybenta
    "</p>"
    "</div>"
    "<div style='padding:20px 40px;background:#102C26;text-align:center'>"
    "<p style='color:rgba(247,231,206,.35);font-size:10px;letter-spacing:.15em;margin:0'>© 2026 Cafe JaKi</p>"
    "</div>"
    "</div>"))

;; Wysyla POST do Resend API
;; Odbiorca to zawsze email kawiarni - jedyne co dziala na darmowym planie bez domeny
(defn wyslij-powiadomienie! [email-subskrybenta]
  (http/post "https://api.resend.com/emails"
    {:headers      {"Authorization" (str "Bearer " resend-api-key)
                    "Content-Type"  "application/json"}
     :body         (json/generate-string
                     {:from    "Cafe JaKi <onboarding@resend.dev>"
                      :to      [email-kawiarni]
                      :subject (str "Nowy subskrybent: " email-subskrybenta)
                      :html    (html-powiadomienie email-subskrybenta)})
     :as           :json
     :throw-exceptions false}))

;; Buduje mape odpowiedzi HTTP z naglowkami CORS
(defn odpowiedz [status body]
  {:status  status
   :headers {"Content-Type"                 "application/json"
             "Access-Control-Allow-Origin"  "*"
             "Access-Control-Allow-Methods" "POST, OPTIONS"
             "Access-Control-Allow-Headers" "Content-Type"}
   :body    (json/generate-string body)})

;; Definicja tras
(defroutes trasy

  ;; Odpowiedz na preflight CORS (przegladarka pyta czy moze wyslac POST)
  (OPTIONS "/api/newsletter" [] (odpowiedz 200 {}))

  ;; Glowna trasa - odbiera email z formularza i wysyla powiadomienie do kawiarni
  (POST "/api/newsletter" {body :body}
    (let [email (get body "email")]
      (cond
        (not (poprawny-email? email))
        (odpowiedz 400 {:error "Nieprawidlowy adres email."})

        :else
        (let [wynik (wyslij-powiadomienie! email)]
          (if (= 200 (:status wynik))
            (do
              (println (str "[newsletter] Powiadomienie wyslane dla: " email))
              (odpowiedz 200 {:success true :message "Dziekujemy za zapis!"}))
            (do
              (println (str "[newsletter] Blad Resend: " (:body wynik)))
              (odpowiedz 500 {:error "Blad wysylania. Sprawdz klucz API."})))))))

  (route/not-found (odpowiedz 404 {:error "Nie znaleziono."})))

;; Opakowuje trasy w middleware
(def aplikacja
  (-> trasy
      (wrap-json-body {:keywords? false})
      (wrap-cors :access-control-allow-origin  [#".*"]
                 :access-control-allow-methods [:get :post :options]
                 :access-control-allow-headers ["Content-Type"])))

;; Uruchamia serwer na porcie 4000
(defn -main []
  (println "=== Newsletter mikroserwis - Cafe JaKi ===")
  (println "Port: 4000")
  (run-jetty aplikacja {:port 4000 :join? true}))
