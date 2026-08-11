class CreateBundles < ActiveRecord::Migration[8.1]
  def change
    create_table :bundles do |t|
      t.string :public_id, null: false
      t.string :title, null: false

      t.timestamps
    end
    add_index :bundles, :public_id, unique: true
  end
end
