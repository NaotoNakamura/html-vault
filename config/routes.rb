Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :bundles, only: %i[index create destroy]
    end
  end

  # Direct-link viewer for a file within a bundle, e.g. /preview/aB3dEf9k/style.css.
  # Every upload (even a single file) is a Bundle, so this is the only preview route.
  # Serving bundle members under a shared path lets an HTML file's relative
  # references (<link href="style.css">) resolve against this URL correctly.
  # format: false is required so a trailing extension like .css isn't parsed
  # as a Rails response format and stripped from the glob-captured filename.
  get "/preview/:bundle_public_id/*filename", to: "preview#bundle_show", as: :bundle_preview, format: false

  root to: "admin#index"
end
