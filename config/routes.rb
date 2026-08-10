Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :user_files, only: %i[index create destroy]
    end
  end

  # Direct-link viewer for an uploaded file, e.g. /v/aB3dEf9k
  get "/v/:public_id", to: "preview#show", as: :preview

  root to: "fallback#index"

  # SPA fallback: any other HTML GET request falls through to the built React app,
  # letting a client-side router (if any) take over. Must stay last so it never
  # shadows the routes defined above.
  get "*path", to: "fallback#index", constraints: ->(req) { req.format.html? }
end
